import { withTenantContext } from '@/lib/db';
import { recordChargeAccrual } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';
import { waterAmount, validateTiers, round2, type WaterTier } from '@/lib/domain/water';

/**
 * Cobro de agua potable por filial.
 *
 * El modelo completo (WaterMode, WaterTariffTier, WaterReading y la
 * función SQL water_amount) existía en el schema desde la migración 05
 * sin una sola pantalla ni servicio. El cálculo escalonado vive en
 * src/lib/domain/water.ts — espejo de la función SQL — para poder
 * previsualizar el monto en el formulario y probarlo.
 */

export type WaterConfig = {
  mode: 'sin_cobro' | 'tarifa_plana' | 'escalonado';
  flatFee: number;
  tiers: WaterTier[];
};

export type WaterRow = {
  propertyId: string;
  code: string;
  ownerName: string | null;
  /** Última lectura conocida ANTES del período — arranque del medidor. */
  previousReading: number;
  /** Lectura ya registrada para el período, si existe. */
  reading: {
    previous: number;
    current: number;
    consumption: number;
    chargeAmount: number | null;
    chargeStatus: string | null;
  } | null;
};

export type WaterBoard = WaterConfig & { rows: WaterRow[] };

/** Primer día del mes del período, en UTC — igual que las columnas @db.Date. */
export function periodStart(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export async function getWaterConfig(companyId: string, condominiumId: string): Promise<WaterConfig> {
  return withTenantContext(companyId, async (tx) => {
    const [settings, tiers] = await Promise.all([
      tx.condominiumFinancialSettings.findUnique({
        where: { condominiumId },
        select: { waterMode: true, waterFlatFee: true },
      }),
      tx.waterTariffTier.findMany({ where: { condominiumId }, orderBy: { tierOrder: 'asc' } }),
    ]);
    return {
      mode: settings?.waterMode ?? 'sin_cobro',
      flatFee: Number(settings?.waterFlatFee ?? 0),
      tiers: tiers.map((t) => ({ upToM3: t.upToM3 === null ? null : Number(t.upToM3), pricePerM3: Number(t.pricePerM3) })),
    };
  });
}

/**
 * Guarda modo, tarifa plana y tramos en una sola transacción. Los
 * tramos se REEMPLAZAN completos: editarlos por diferencia complica
 * todo sin ganar nada con 3-5 filas.
 */
export async function saveWaterConfig(
  companyId: string,
  user: { id: string; name: string },
  input: { condominiumId: string; mode: string; flatFee: number; tiers: WaterTier[] }
) {
  if (!['sin_cobro', 'tarifa_plana', 'escalonado'].includes(input.mode)) {
    throw new Error('Modo de cobro desconocido.');
  }
  if (input.mode === 'tarifa_plana' && !(input.flatFee > 0)) {
    throw new Error('Indicá el monto de la tarifa plana.');
  }
  if (input.mode === 'escalonado') {
    const problem = validateTiers(input.tiers);
    if (problem) throw new Error(problem);
  }

  return withTenantContext(companyId, async (tx) => {
    await tx.condominiumFinancialSettings.update({
      where: { condominiumId: input.condominiumId },
      data: { waterMode: input.mode as any, waterFlatFee: input.flatFee },
    });
    await tx.waterTariffTier.deleteMany({ where: { condominiumId: input.condominiumId } });
    if (input.mode === 'escalonado') {
      await tx.waterTariffTier.createMany({
        data: input.tiers.map((t, i) => ({
          condominiumId: input.condominiumId,
          tierOrder: i + 1,
          upToM3: t.upToM3,
          pricePerM3: t.pricePerM3,
        })),
      });
    }
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Configuración de agua actualizada',
      target: input.mode,
    });
  });
}

/**
 * Estado del cobro de agua de un período: cada filial activa con su
 * lectura anterior (para precargar el formulario) y la lectura del
 * período si ya se registró. Todo en lote, no una consulta por unidad.
 */
export async function getWaterBoard(
  companyId: string,
  condominiumId: string,
  period: Date
): Promise<WaterBoard> {
  const config = await getWaterConfig(companyId, condominiumId);
  return withTenantContext(companyId, async (tx) => {
    const [properties, owners, readings] = await Promise.all([
      tx.property.findMany({
        where: { condominiumId, status: 'activa' },
        orderBy: { code: 'asc' },
        select: { id: true, code: true },
      }),
      tx.propertyMember.findMany({
        where: { property: { condominiumId }, endDate: null, role: 'propietario' },
        select: { propertyId: true, person: { select: { fullName: true } } },
      }),
      // Todas las lecturas hasta el período inclusive: la más reciente
      // anterior al período es el arranque del medidor.
      tx.waterReading.findMany({
        where: { property: { condominiumId }, period: { lte: period } },
        orderBy: { period: 'desc' },
        include: { charge: { select: { amount: true, status: true } } },
      }),
    ]);

    const ownerByProperty = new Map<string, string>();
    for (const o of owners) {
      const prev = ownerByProperty.get(o.propertyId);
      ownerByProperty.set(o.propertyId, prev ? `${prev} · ${o.person.fullName}` : o.person.fullName);
    }

    const currentByProperty = new Map<string, (typeof readings)[number]>();
    const lastBeforeByProperty = new Map<string, (typeof readings)[number]>();
    for (const r of readings) {
      if (r.period.getTime() === period.getTime()) {
        currentByProperty.set(r.propertyId, r);
      } else if (!lastBeforeByProperty.has(r.propertyId)) {
        // Vienen ordenadas de más reciente a más vieja.
        lastBeforeByProperty.set(r.propertyId, r);
      }
    }

    return {
      ...config,
      rows: properties.map((p) => {
        const current = currentByProperty.get(p.id);
        const before = lastBeforeByProperty.get(p.id);
        return {
          propertyId: p.id,
          code: p.code,
          ownerName: ownerByProperty.get(p.id) ?? null,
          previousReading: before ? Number(before.currentReading) : 0,
          reading: current
            ? {
                previous: Number(current.previousReading),
                current: Number(current.currentReading),
                consumption: round2(Number(current.currentReading) - Number(current.previousReading)),
                chargeAmount: current.charge ? Number(current.charge.amount) : null,
                chargeStatus: current.charge?.status ?? null,
              }
            : null,
        };
      }),
    };
  });
}

/**
 * Registra la lectura del período y genera el cobro de agua de la
 * filial — TODO en una transacción: si el cargo no se puede asentar,
 * la lectura tampoco queda. La restricción única (propertyId, period)
 * impide cobrar dos veces el mismo mes.
 */
export async function registerWaterCharge(
  companyId: string,
  user: { id: string; name: string },
  input: {
    condominiumId: string;
    propertyId: string;
    period: Date;
    previousReading: number;
    currentReading: number;
  }
) {
  if (input.currentReading < input.previousReading) {
    throw new Error('La lectura actual no puede ser menor que la anterior.');
  }

  const config = await getWaterConfig(companyId, input.condominiumId);
  if (config.mode === 'sin_cobro') {
    throw new Error('Este condominio no tiene configurado el cobro de agua.');
  }

  const m3 = round2(input.currentReading - input.previousReading);
  const amount = config.mode === 'tarifa_plana' ? round2(config.flatFee) : waterAmount(config.tiers, m3);
  if (amount <= 0) {
    throw new Error('El monto del cobro resulta en cero — revisá la lectura y la tarifa.');
  }

  return withTenantContext(companyId, async (tx) => {
    // La filial se comprueba contra la BASE, no contra el formulario.
    const property = await tx.property.findFirst({
      where: { id: input.propertyId, condominiumId: input.condominiumId },
      select: { id: true, code: true },
    });
    if (!property) throw new Error('Esa filial no pertenece a este condominio.');

    const settings = await tx.condominiumFinancialSettings.findUnique({
      where: { condominiumId: input.condominiumId },
      select: { dueDay: true },
    });
    // El consumo del mes se cobra con vencimiento en el mes siguiente,
    // el mismo día de vencimiento de la cuota ordinaria.
    const dueDate = new Date(
      Date.UTC(input.period.getUTCFullYear(), input.period.getUTCMonth() + 1, settings?.dueDay ?? 15)
    );
    const label = `${MES[input.period.getUTCMonth()]} ${input.period.getUTCFullYear()}`;
    const consumo = config.mode === 'tarifa_plana' ? `tarifa plana` : `${m3} m³`;

    const charge = await tx.charge.create({
      data: {
        condominiumId: input.condominiumId,
        propertyId: property.id,
        chargeType: 'agua_potable',
        description: `Agua potable — ${label} (${consumo})`,
        amount,
        period: input.period,
        dueDate,
      },
    });

    try {
      await tx.waterReading.create({
        data: {
          propertyId: property.id,
          period: input.period,
          previousReading: input.previousReading,
          currentReading: input.currentReading,
          chargeId: charge.id,
          createdById: user.id,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new Error(`La lectura de ${label} de ${property.code} ya está registrada — el cobro no se duplicó.`);
      }
      throw e;
    }

    await recordChargeAccrual(tx, companyId, {
      id: charge.id,
      condominiumId: input.condominiumId,
      propertyCode: property.code,
      chargeType: charge.chargeType,
      description: charge.description,
      amount: Number(charge.amount),
      period: charge.period,
      issuedAt: charge.createdAt,
    });

    await tx.propertyEvent.create({
      data: {
        propertyId: property.id,
        eventType: 'cargo',
        description: `Cobro de agua potable de ${label}: ${new Intl.NumberFormat('es-CR').format(amount)} (${consumo}).`,
      },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Cobro de agua generado',
      target: `${property.code} · ${label}`,
    });

    return { charge, consumption: m3, amount };
  });
}
