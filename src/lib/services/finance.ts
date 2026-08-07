import { withTenantContext } from '@/lib/db';
import { recordChargeAccrual, recordPaymentEntry } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';
import { allocatePaymentOldestFirst } from '@/lib/domain/payment-allocation';

/**
 * Saldo de una unidad: cargos vigentes (no anulados) menos lo
 * realmente aplicado en pagos vigentes. Replica v_property_balance
 * (prisma/sql/01_views_functions_triggers.sql) con Prisma, para no
 * depender exclusivamente de la vista SQL en el camino caliente de
 * la aplicación (estado de cuenta, formulario de pago).
 */
export async function getPropertyBalance(companyId: string, propertyId: string): Promise<number> {
  return withTenantContext(companyId, async (tx) => {
    const charges = await tx.charge.findMany({
      where: { propertyId, status: { not: 'anulado' } },
      select: { amount: true },
    });
    const totalCharged = charges.reduce((sum, c) => sum + Number(c.amount), 0);

    const allocations = await tx.paymentAllocation.findMany({
      where: { charge: { propertyId }, payment: { status: 'aplicado' } },
      select: { amount: true },
    });
    const totalPaid = allocations.reduce((sum, a) => sum + Number(a.amount), 0);

    return totalCharged - totalPaid;
  });
}

/**
 * Suspensión de servicios — SOLO cuenta atraso en la cuota
 * condominal ordinaria vencida (due_date < hoy), replicando
 * v_property_suspension. Bloquea reservas, autorización de visitas y
 * el Árbitro Legal IA (aplicado en cada uno de esos servicios, no
 * aquí — este servicio solo responde la pregunta).
 */
export async function getPropertySuspension(companyId: string, propertyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const property = await tx.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { condominiumId: true },
    });
    const settings = await tx.condominiumFinancialSettings.findUnique({
      where: { condominiumId: property.condominiumId },
    });
    if (!settings) return { monthsOverdue: 0, suspended: false };

    const overdueOrdinaryCharges = await tx.charge.count({
      where: {
        propertyId,
        chargeType: 'cuota_ordinaria',
        status: { in: ['pendiente', 'parcial'] },
        dueDate: { lt: new Date() },
      },
    });

    return {
      monthsOverdue: overdueOrdinaryCharges,
      suspended: settings.suspensionEnabled && overdueOrdinaryCharges >= settings.suspensionMonths,
    };
  });
}

export async function listChargesByProperty(companyId: string, propertyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.charge.findMany({
      where: { propertyId },
      orderBy: { dueDate: 'desc' },
      include: { allocations: { select: { amount: true } } },
    })
  );
}

export async function listPaymentsByProperty(companyId: string, propertyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.payment.findMany({
      where: { propertyId },
      orderBy: { paymentDate: 'desc' },
      // "Asociado a": a qué cobro(s) se aplicó cada pago.
      include: { allocations: { include: { charge: { select: { description: true } } } } },
    })
  );
}

/**
 * Facturación ordinaria del período — SOLO cuota_ordinaria se genera
 * y notifica de forma automática/masiva (migración 07); todo lo demás
 * es manual, sin excepción. Idempotente: la restricción única
 * (condominiumId, batchType, period) del schema evita una segunda
 * corrida para el mismo mes.
 */
/**
 * Emite la cuota ordinaria de un período.
 *
 * IDEMPOTENTE POR PERÍODO: si ya existe un lote ordinario de ese mes
 * lo devuelve sin crear nada. Es indispensable ahora que la emisión
 * corre automáticamente — sin esta guarda, dos disparos del
 * programador (o un reintento tras un error de red) le cobrarían la
 * cuota dos veces a todo el condominio.
 */
export async function generateOrdinaryBilling(companyId: string, condominiumId: string, period: Date) {
  return withTenantContext(companyId, async (tx) => {
    const existing = await tx.feeBatch.findFirst({
      where: { condominiumId, batchType: 'ordinaria', period },
    });
    if (existing) return { batch: existing, created: false, chargesCreated: 0 };

    const settings = await tx.condominiumFinancialSettings.findUniqueOrThrow({
      where: { condominiumId },
    });
    const properties = await tx.property.findMany({
      where: { condominiumId, status: 'activa' },
    });
    if (properties.length === 0) throw new Error('Este condominio no tiene unidades activas todavía.');

    const dueDate = new Date(period);
    dueDate.setDate(settings.dueDay);

    const batch = await tx.feeBatch.create({
      data: {
        condominiumId,
        batchType: 'ordinaria',
        period,
        description: `Cuota ordinaria ${period.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}`,
        totalAmount: Number(settings.baseFee) * properties.length,
        unitsCount: properties.length,
      },
    });

    await tx.charge.createMany({
      data: properties.map((p) => ({
        condominiumId,
        propertyId: p.id,
        batchId: batch.id,
        chargeType: 'cuota_ordinaria' as const,
        description: batch.description,
        period,
        amount: settings.baseFee,
        dueDate,
      })),
    });

    // Devengo: un asiento de reconocimiento de ingreso por cada cargo
    // recién emitido (Débito Cuentas por Cobrar / Crédito Ingreso) —
    // se necesitan los IDs reales, así que se releen tras el createMany.
    const createdCharges = await tx.charge.findMany({
      where: { batchId: batch.id },
      include: { property: { select: { code: true } } },
    });
    for (const ch of createdCharges) {
      await recordChargeAccrual(tx, companyId, {
        id: ch.id,
        condominiumId,
        propertyCode: ch.property.code,
        chargeType: ch.chargeType,
        description: ch.description,
        amount: Number(ch.amount),
        period: ch.period,
        dueDate: ch.dueDate,
      });
    }

    return { batch, created: true, chargesCreated: createdCharges.length };
  },
  // Emitir la cuota de un condominio grande son cientos de escrituras
  // —un cargo y su asiento de devengo por filial— dentro de una sola
  // transacción. Con el plazo de 5 s de Prisma, contra una base remota
  // se corta a mitad y no se emite nada. Ver `withTenantContext`.
  { timeout: 120_000, maxWait: 20_000 });
}

export async function addManualCharge(
  companyId: string,
  input: {
    condominiumId: string;
    propertyId: string;
    chargeType: string;
    description: string;
    amount: number;
    dueDate: Date;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const charge = await tx.charge.create({
      data: {
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        chargeType: input.chargeType as any,
        description: input.description,
        amount: input.amount,
        dueDate: input.dueDate,
      },
      include: { property: { select: { code: true } } },
    });
    await recordChargeAccrual(tx, companyId, {
      id: charge.id,
      condominiumId: input.condominiumId,
      propertyCode: charge.property.code,
      chargeType: charge.chargeType,
      description: charge.description,
      amount: Number(charge.amount),
      period: charge.period,
      dueDate: charge.dueDate,
    });
    return charge;
  });
}

/**
 * Registra un pago y lo aplica a los cargos pendientes/parciales más
 * ANTIGUOS primero — misma regla que el prototipo. El trigger
 * sync_charge_status (prisma/sql/01_views_functions_triggers.sql) se
 * encarga de recalcular charges.status apenas se insertan las
 * payment_allocations; esta función no lo hace dos veces.
 */
export async function makePayment(
  companyId: string,
  input: {
    condominiumId: string;
    propertyId: string;
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
    /**
     * Fecha real del pago. Se omite en el uso normal —el cajero
     * registra lo que acaba de recibir— pero es imprescindible al
     * cargar movimientos bancarios de meses anteriores: sin esto todo
     * el histórico queda fechado el día de la carga y el estado de
     * cuenta del condómino miente sobre cuándo pagó.
     */
    paymentDate?: Date;
  },
  userId: string,
  userName: string
) {
  return withTenantContext(companyId, async (tx) => {
    const pendingCharges = await tx.charge.findMany({
      where: { propertyId: input.propertyId, status: { in: ['pendiente', 'parcial'] } },
      orderBy: { dueDate: 'asc' },
      include: { allocations: { select: { amount: true } } },
    });

    const payment = await tx.payment.create({
      data: {
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        amount: input.amount,
        method: input.method as any,
        ...(input.paymentDate ? { paymentDate: input.paymentDate } : {}),
        reference: input.reference || null,
        notes: input.notes || null,
        receivedById: userId,
      },
    });

    let appliedToCharges = 0;
    const { allocations, advance } = allocatePaymentOldestFirst(
      pendingCharges.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        alreadyPaid: c.allocations.reduce((s, a) => s + Number(a.amount), 0),
        dueDate: c.dueDate,
      })),
      input.amount
    );
    for (const a of allocations) {
      await tx.paymentAllocation.create({ data: { paymentId: payment.id, chargeId: a.chargeId, amount: a.amount } });
      appliedToCharges += a.amount;
    }
    const remaining = advance;

    const property = await tx.property.findUniqueOrThrow({
      where: { id: input.propertyId },
      select: { code: true },
    });
    await recordPaymentEntry(tx, companyId, {
      id: payment.id,
      condominiumId: input.condominiumId,
      propertyCode: property.code,
      amount: input.amount,
      appliedToCharges,
    });
    await logActivity(tx, companyId, {
      userId,
      userName,
      module: 'Finanzas',
      action: 'Pago registrado',
      target: `${property.code} · ${new Intl.NumberFormat('es-CR').format(input.amount)}`,
    });

    await tx.propertyEvent.create({
      data: {
        propertyId: input.propertyId,
        eventType: 'pago',
        description: `Pago de ${new Intl.NumberFormat('es-CR').format(input.amount)} aplicado${remaining > 0 ? ' (con excedente registrado como adelanto de condómino)' : ''}.`,
      },
    });

    return payment;
  });
}

/** Resumen financiero de un condominio — reutiliza v_condo_finance_kpis. */
export async function getCondoFinanceSummary(companyId: string, condominiumId: string) {
  const rows = await withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<
      { total_units: bigint; units_current: bigint; units_delinquent: bigint }[]
    >`SELECT * FROM v_condo_finance_kpis WHERE condominium_id = ${condominiumId}`
  );
  return rows[0] ?? { total_units: 0n, units_current: 0n, units_delinquent: 0n };
}

/**
 * Propiedades de un condominio con saldo y suspensión ya calculados
 * en lote (no N+1): una consulta de cargos + una de aplicaciones para
 * TODO el condominio, agregadas en memoria — no una por unidad.
 */
export async function listPropertiesWithBalance(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const [properties, settings, charges, allocations] = await Promise.all([
      tx.property.findMany({ where: { condominiumId, status: 'activa' }, orderBy: { code: 'asc' } }),
      tx.condominiumFinancialSettings.findUnique({ where: { condominiumId } }),
      tx.charge.findMany({
        where: { condominiumId, status: { not: 'anulado' } },
        select: { id: true, propertyId: true, amount: true, chargeType: true, status: true, dueDate: true },
      }),
      tx.paymentAllocation.findMany({
        where: { charge: { condominiumId }, payment: { status: 'aplicado' } },
        select: { chargeId: true, amount: true },
      }),
    ]);

    const paidByCharge = new Map<string, number>();
    for (const a of allocations) {
      paidByCharge.set(a.chargeId, (paidByCharge.get(a.chargeId) ?? 0) + Number(a.amount));
    }

    const now = new Date();
    const chargesByProperty = new Map<string, typeof charges>();
    for (const c of charges) {
      if (!chargesByProperty.has(c.propertyId)) chargesByProperty.set(c.propertyId, []);
      chargesByProperty.get(c.propertyId)!.push(c);
    }

    return properties.map((p) => {
      const myCharges = chargesByProperty.get(p.id) ?? [];
      const balance = myCharges.reduce(
        (sum, c) => sum + (Number(c.amount) - (paidByCharge.get(c.id) ?? 0)),
        0
      );
      const overdueOrdinary = myCharges.filter(
        (c) =>
          c.chargeType === 'cuota_ordinaria' &&
          ['pendiente', 'parcial'].includes(c.status) &&
          c.dueDate < now
      ).length;
      const suspended = !!settings?.suspensionEnabled && overdueOrdinary >= (settings?.suspensionMonths ?? 3);
      return { ...p, balance, suspended, monthsOverdue: overdueOrdinary };
    });
  });
}
