import { withTenantContext } from '@/lib/db';
import { recordChargeAccrual, recordPaymentEntry } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';
import { allocatePaymentOldestFirst } from '@/lib/domain/payment-allocation';
import { fechaSolo } from '@/lib/fecha-local';

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
    // Una suspensión MANUAL (decisión expresa de la administración,
    // registrada en property_service_suspensions con endedAt nulo)
    // suspende aunque no haya configuración financiera y aunque exista
    // convenio: la levanta la administración, no una regla.
    const manual = await tx.propertyServiceSuspension.findFirst({
      where: { propertyId, endedAt: null },
      select: { id: true },
    });
    if (!settings) {
      return { monthsOverdue: 0, hasPaymentPlan: false, suspended: Boolean(manual), manualSuspension: Boolean(manual) };
    }

    const [overdueOrdinaryCharges, plan] = await Promise.all([
      tx.charge.count({
        where: {
          propertyId,
          chargeType: 'cuota_ordinaria',
          status: { in: ['pendiente', 'parcial'] },
          dueDate: { lt: new Date() },
        },
      }),
      // Convenio de pago vigente: la filial NO se suspende. El interés
      // moratorio y la escalera de cobranza ya lo respetaban; dejar la
      // suspensión fuera vaciaba el sentido del arreglo — al condómino
      // que negoció y está pagando se le seguía cerrando la reserva, la
      // autorización de visitas y el Árbitro Legal.
      tx.paymentPlan.findFirst({ where: { propertyId, status: 'vigente' }, select: { id: true } }),
    ]);

    const hasPaymentPlan = Boolean(plan);
    return {
      monthsOverdue: overdueOrdinaryCharges,
      hasPaymentPlan,
      suspended:
        Boolean(manual) ||
        (!hasPaymentPlan && settings.suspensionEnabled && overdueOrdinaryCharges >= settings.suspensionMonths),
      manualSuspension: Boolean(manual),
    };
  });
}

/**
 * Suspensión MANUAL de servicios de una filial. La tabla
 * property_service_suspensions estaba en el schema sin uso; hoy solo
 * escribe aquí — una fila con endedAt nulo significa "suspendida por
 * decisión de la administración" y pesa más que el convenio o la regla
 * automática, porque la levanta una persona, no un cálculo.
 */
export async function suspendPropertyServices(
  companyId: string,
  user: { id: string; name: string },
  input: { condominiumId: string; propertyId: string }
) {
  return withTenantContext(companyId, async (tx) => {
    // La filial se comprueba contra la BASE, no contra el formulario.
    const property = await tx.property.findFirst({
      where: { id: input.propertyId, condominiumId: input.condominiumId },
      select: { id: true, code: true },
    });
    if (!property) throw new Error('Esa filial no pertenece a este condominio.');

    const open = await tx.propertyServiceSuspension.findFirst({
      where: { propertyId: property.id, endedAt: null },
      select: { id: true },
    });
    if (open) throw new Error('Esta filial ya tiene los servicios suspendidos.');

    const overdue = await tx.charge.count({
      where: {
        propertyId: property.id,
        chargeType: 'cuota_ordinaria',
        status: { in: ['pendiente', 'parcial'] },
        dueDate: { lt: new Date() },
      },
    });

    const suspension = await tx.propertyServiceSuspension.create({
      data: { propertyId: property.id, monthsOverdue: overdue },
    });
    await tx.propertyEvent.create({
      data: {
        propertyId: property.id,
        eventType: 'suspension_activada',
        description: `Servicios suspendidos por la administración (${overdue} cuota(s) ordinaria(s) vencida(s)).`,
      },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Servicios suspendidos',
      target: property.code,
    });
    return suspension;
  });
}

/** Levanta la suspensión manual vigente de una filial. */
export async function liftPropertySuspension(
  companyId: string,
  user: { id: string; name: string },
  input: { condominiumId: string; propertyId: string; reason?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const property = await tx.property.findFirst({
      where: { id: input.propertyId, condominiumId: input.condominiumId },
      select: { id: true, code: true },
    });
    if (!property) throw new Error('Esa filial no pertenece a este condominio.');

    const open = await tx.propertyServiceSuspension.findFirst({
      where: { propertyId: property.id, endedAt: null },
      select: { id: true },
    });
    if (!open) throw new Error('Esta filial no tiene una suspensión manual vigente.');

    await tx.propertyServiceSuspension.update({
      where: { id: open.id },
      data: { endedAt: new Date(), endedReason: input.reason || 'Levantada por la administración' },
    });
    await tx.propertyEvent.create({
      data: {
        propertyId: property.id,
        eventType: 'suspension_levantada',
        description: input.reason
          ? `Suspensión de servicios levantada: ${input.reason}`
          : 'Suspensión de servicios levantada por la administración.',
      },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Suspensión levantada',
      target: property.code,
    });
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

    // El período es una columna `@db.Date`: medianoche UTC del día 1.
    // Todo el cálculo va en UTC. Con `setDate()` —que trabaja en hora
    // LOCAL— un servidor en Costa Rica (UTC−6) leía ese instante como
    // las 6 p.m. del último día del mes ANTERIOR, y la cuota de agosto
    // salía descrita como "julio" y con vencimiento el 16 de julio: un
    // cobro que nace vencido, devenga mora y puede suspender servicios.
    const dueDate = new Date(
      Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), settings.dueDay)
    );

    const batch = await tx.feeBatch.create({
      data: {
        condominiumId,
        batchType: 'ordinaria',
        period,
        description: `Cuota ordinaria ${fechaSolo(period, { month: 'long', year: 'numeric' })}`,
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
        issuedAt: ch.createdAt,
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
      issuedAt: charge.createdAt,
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
/**
 * `charges`/`allocations` de acá abajo NO llevan `take`, a propósito:
 * es el saldo real de cada filial (evaluación de errores 2026-08-11,
 * #16), y este mismo resultado alimenta dos exports contables
 * (`finanzas/exportar`, `finanzas/exportar-estado`) que tienen que
 * cuadrar con TODO el historial de cargos, no solo lo reciente. Un
 * `take` acá sería el mismo tipo de bug que "arregla" el síntoma
 * (consulta más liviana) rompiendo el fondo (saldo mal calculado para
 * cualquier filial con más cargos que el tope). La reducción a saldo
 * por filial SÍ se podría mover a SQL (`groupBy` por `propertyId`),
 * como se hizo en `reserve-fund.ts`/`petty-cash.ts` — no se hizo acá
 * en esta pasada porque `allocations` se une por `chargeId`, no por
 * `propertyId` directamente, y ese `groupBy` con join merece su propia
 * sesión con pruebas dedicadas, no un cambio apurado al dashboard
 * financiero principal.
 */
export async function listPropertiesWithBalance(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const [properties, settings, charges, allocations, plans, owners, manualSuspensions] = await Promise.all([
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
      // Mismo criterio que getPropertySuspension: un convenio vigente
      // no suspende. Se trae en lote para no consultar por unidad.
      tx.paymentPlan.findMany({ where: { condominiumId, status: 'vigente' }, select: { propertyId: true } }),
      // Propietario vigente de cada filial, para el detalle de al
      // día / morosidad. En lote, no por unidad.
      tx.propertyMember.findMany({
        where: { property: { condominiumId }, endDate: null, role: 'propietario' },
        select: { propertyId: true, person: { select: { fullName: true } } },
      }),
      // Suspensión manual vigente (ver suspendPropertyServices).
      tx.propertyServiceSuspension.findMany({
        where: { endedAt: null, property: { condominiumId } },
        select: { propertyId: true },
      }),
    ]);
    const withPlan = new Set(plans.map((p) => p.propertyId));
    const manuallySuspended = new Set(manualSuspensions.map((s) => s.propertyId));
    const ownerByProperty = new Map<string, string>();
    for (const o of owners) {
      const prev = ownerByProperty.get(o.propertyId);
      ownerByProperty.set(o.propertyId, prev ? `${prev} · ${o.person.fullName}` : o.person.fullName);
    }

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
      const hasPaymentPlan = withPlan.has(p.id);
      const manualSuspension = manuallySuspended.has(p.id);
      const suspended =
        manualSuspension ||
        (!hasPaymentPlan && !!settings?.suspensionEnabled && overdueOrdinary >= (settings?.suspensionMonths ?? 3));
      return {
        ...p,
        balance,
        suspended,
        manualSuspension,
        hasPaymentPlan,
        monthsOverdue: overdueOrdinary,
        ownerName: ownerByProperty.get(p.id) ?? null,
      };
    });
  });
}
