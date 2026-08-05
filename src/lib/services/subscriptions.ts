import { prisma, withTenantContext } from '@/lib/db';
import {
  subscriptionState,
  nextPeriodEnd,
  type SubscriptionState,
} from '@/lib/domain/subscription';

/**
 * Suscripciones de las empresas administradoras.
 *
 * El estado no se guarda: se calcula con `subscriptionState` cada vez
 * que se pide. Lo único que se persiste son hechos —la fecha del
 * próximo pago, los pagos registrados y si el master bloqueó la
 * cuenta—, nunca conclusiones.
 */

export type CompanySubscription = {
  companyId: string;
  companyName: string;
  legalName: string;
  planId: string | null;
  planName: string | null;
  price: number;
  currency: string;
  period: string;
  maxCondominiums: number;
  condominiums: number;
  nextPaymentDate: Date | null;
  blockedAt: Date | null;
  blockReason: string | null;
  state: SubscriptionState;
  lastPaymentAt: Date | null;
};

// ============================================================
// Planes
// ============================================================

export async function listPlans(soloActivos = false) {
  return prisma.subscriptionPlan.findMany({
    where: soloActivos ? { isActive: true } : {},
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    include: { _count: { select: { companies: true } } },
  });
}

export type PlanInput = {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  period: 'mensual' | 'trimestral' | 'semestral' | 'anual';
  maxCondominiums: number;
  graceDays: number;
  isActive?: boolean;
  sortOrder?: number;
};

export async function savePlan(planId: string | null, input: PlanInput) {
  const data = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: input.price,
    currency: input.currency?.trim() || 'CRC',
    period: input.period,
    maxCondominiums: Math.max(0, Math.floor(input.maxCondominiums)),
    graceDays: Math.max(0, Math.floor(input.graceDays)),
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
  return planId
    ? prisma.subscriptionPlan.update({ where: { id: planId }, data })
    : prisma.subscriptionPlan.create({ data });
}

export async function deletePlan(planId: string) {
  const enUso = await prisma.company.count({ where: { planId } });
  if (enUso > 0) {
    throw new Error(`Este plan lo tienen ${enUso} empresa(s). Desactivalo en vez de borrarlo.`);
  }
  return prisma.subscriptionPlan.delete({ where: { id: planId } });
}

// ============================================================
// Estado de las empresas
// ============================================================

export async function listSubscriptions(now: Date = new Date()): Promise<CompanySubscription[]> {
  const empresas = await prisma.company.findMany({
    orderBy: { legalName: 'asc' },
    include: {
      plan: true,
      subscriptionPayments: { orderBy: { paidAt: 'desc' }, take: 1, select: { paidAt: true } },
    },
  });

  const salida: CompanySubscription[] = [];
  for (const e of empresas) {
    // Los condominios llevan RLS: se cuentan con el contexto de su
    // empresa, no con una consulta por encima.
    const condominiums = await withTenantContext(e.id, (tx) =>
      tx.condominium.count({ where: { deletedAt: null } })
    ).catch(() => 0);

    salida.push({
      companyId: e.id,
      companyName: e.tradeName ?? e.legalName,
      legalName: e.legalName,
      planId: e.planId,
      planName: e.plan?.name ?? null,
      price: Number(e.plan?.price ?? 0),
      currency: e.plan?.currency ?? 'CRC',
      period: e.plan?.period ?? 'mensual',
      maxCondominiums: e.plan?.maxCondominiums ?? 0,
      condominiums,
      nextPaymentDate: e.nextPaymentDate,
      blockedAt: e.blockedAt,
      blockReason: e.blockReason,
      lastPaymentAt: e.subscriptionPayments[0]?.paidAt ?? null,
      state: subscriptionState(
        {
          planId: e.planId,
          nextPaymentDate: e.nextPaymentDate,
          blockedAt: e.blockedAt,
          graceDays: e.plan?.graceDays ?? 5,
        },
        now
      ),
    });
  }
  return salida;
}

/** Empresas que requieren atención del master, más urgentes primero. */
export async function pendingAttention(now: Date = new Date()) {
  const todas = await listSubscriptions(now);
  const orden = { en_mora: 0, en_gracia: 1, sin_plan: 2, por_vencer: 3, bloqueada: 4, al_dia: 5 };
  return todas
    .filter((s) => s.state.action === 'bloquear' || s.state.action === 'avisar')
    .sort((a, b) => (orden[a.state.status] ?? 9) - (orden[b.state.status] ?? 9));
}

/** Estado de UNA empresa. Lo usan los layouts para decidir el bloqueo. */
export async function getCompanySubscription(
  companyId: string,
  now: Date = new Date()
): Promise<SubscriptionState & { blocked: boolean }> {
  const e = await prisma.company.findUnique({
    where: { id: companyId },
    select: { planId: true, nextPaymentDate: true, blockedAt: true, plan: { select: { graceDays: true } } },
  });
  if (!e) return { ...subscriptionState({}, now), blocked: false };

  const state = subscriptionState(
    { planId: e.planId, nextPaymentDate: e.nextPaymentDate, blockedAt: e.blockedAt, graceDays: e.plan?.graceDays ?? 5 },
    now
  );
  // Solo el bloqueo explícito corta el acceso. Estar en mora avisa al
  // master, pero no deja a nadie fuera sin que él lo decida.
  return { ...state, blocked: Boolean(e.blockedAt) };
}

// ============================================================
// Acciones sobre la cuenta
// ============================================================

export async function assignPlan(
  master: { userId: string; userName: string },
  companyId: string,
  planId: string,
  firstPaymentDate: Date
) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('El plan no existe.');

  await prisma.company.update({
    where: { id: companyId },
    data: {
      planId,
      nextPaymentDate: firstPaymentDate,
      subscriptionStartedAt: firstPaymentDate,
    },
  });
  await bitacora(companyId, master, 'Plan asignado', `${plan.name} · próximo pago ${iso(firstPaymentDate)}`);
}

/**
 * Registra un pago y corre la fecha del próximo.
 *
 * Desbloquea la empresa si estaba bloqueada: pagar es exactamente la
 * condición que la dejó fuera, así que hacerlo en dos pasos solo
 * generaría llamadas de clientes que pagaron y siguen sin poder entrar.
 */
export async function registerPayment(
  master: { userId: string; userName: string },
  companyId: string,
  input: { amount?: number; method?: string; reference?: string; note?: string; paidAt?: Date }
) {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    include: { plan: true },
  });
  if (!empresa) throw new Error('La empresa no existe.');
  if (!empresa.plan) throw new Error('Asigná primero un plan a esta empresa.');

  const desde = empresa.nextPaymentDate ?? new Date();
  const hasta = nextPeriodEnd(desde, empresa.plan.period as any);

  await prisma.$transaction([
    prisma.subscriptionPayment.create({
      data: {
        companyId,
        planId: empresa.planId,
        amount: input.amount ?? Number(empresa.plan.price),
        currency: empresa.plan.currency,
        periodStart: desde,
        periodEnd: hasta,
        paidAt: input.paidAt ?? new Date(),
        method: input.method?.trim() || null,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        registeredById: master.userId,
        registeredByName: master.userName,
      },
    }),
    prisma.company.update({
      where: { id: companyId },
      data: { nextPaymentDate: hasta, blockedAt: null, blockReason: null },
    }),
  ]);

  await bitacora(companyId, master, 'Pago de suscripción registrado', `Período hasta ${iso(hasta)}`);
  return { periodEnd: hasta };
}

/**
 * Bloquea el acceso. **No borra nada**: toda la información del
 * condominio queda intacta y vuelve a estar disponible al desbloquear.
 */
export async function blockCompany(
  master: { userId: string; userName: string },
  companyId: string,
  reason: string
) {
  await prisma.company.update({
    where: { id: companyId },
    data: { blockedAt: new Date(), blockReason: reason.trim() || 'Suscripción vencida' },
  });
  await bitacora(companyId, master, 'Acceso bloqueado por suscripción', reason);
}

export async function unblockCompany(master: { userId: string; userName: string }, companyId: string) {
  await prisma.company.update({
    where: { id: companyId },
    data: { blockedAt: null, blockReason: null },
  });
  await bitacora(companyId, master, 'Acceso restablecido', 'Desbloqueo manual');
}

export async function listPayments(companyId: string) {
  return prisma.subscriptionPayment.findMany({
    where: { companyId },
    orderBy: { paidAt: 'desc' },
    take: 50,
    include: { plan: { select: { name: true } } },
  });
}

// ============================================================
// Tope de condominios
// ============================================================

/**
 * ¿Puede esta empresa crear otro condominio?
 *
 * Se consulta antes de crear. Un plan sin tope (`maxCondominiums = 0`)
 * no limita.
 */
export async function canCreateCondominium(
  companyId: string
): Promise<{ ok: boolean; reason?: string; used: number; max: number }> {
  const e = await prisma.company.findUnique({
    where: { id: companyId },
    select: { plan: { select: { name: true, maxCondominiums: true } } },
  });
  const max = e?.plan?.maxCondominiums ?? 0;
  const used = await withTenantContext(companyId, (tx) =>
    tx.condominium.count({ where: { deletedAt: null } })
  ).catch(() => 0);

  if (max === 0) return { ok: true, used, max };
  if (used < max) return { ok: true, used, max };
  return {
    ok: false,
    used,
    max,
    reason: `El plan ${e?.plan?.name ?? 'contratado'} permite ${max} condominio(s) y ya tenés ${used}. Contactá a ANEXYpro para ampliarlo.`,
  };
}

// ============================================================
// Utilidades
// ============================================================

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function bitacora(
  companyId: string,
  master: { userId: string; userName: string },
  action: string,
  target: string
) {
  await withTenantContext(companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId,
        userId: master.userId,
        userName: `${master.userName} (master)`,
        module: 'Suscripción',
        action,
        target,
      },
    })
  ).catch(() => undefined);
}
