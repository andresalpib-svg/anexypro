import { prisma, withTenantContext, forEachCompany } from '@/lib/db';
import { buildAging, stepFor, daysOverdue, type AgingSummary } from '@/lib/domain/aging';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Morosidad, gestión de cobro y convenios de pago.
 *
 * La gestión queda registrada en `CollectionAction` porque, si el caso
 * llega a cobro judicial, la prueba de que se gestionó es tan
 * importante como la deuda misma.
 */

export type DebtorRow = {
  propertyId: string;
  code: string;
  ownerName: string | null;
  total: number;
  oldestDays: number;
  buckets: Record<string, number>;
  hasPlan: boolean;
  lastAction: { type: string; at: Date } | null;
  suggestedStep: { type: string; label: string } | null;
};

export type CollectionsView = {
  aging: AgingSummary;
  debtors: DebtorRow[];
  /** Tasa de recuperación del mes: cobrado ÷ facturado. */
  collectionRate: number;
};

/** Saldo pendiente de cada cargo vivo del condominio. */
async function outstandingCharges(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.charge.findMany({
      where: { condominiumId, status: { in: ['pendiente', 'parcial'] } },
      select: {
        propertyId: true,
        amount: true,
        dueDate: true,
        allocations: { where: { payment: { status: 'aplicado' } }, select: { amount: true } },
      },
    })
  );
}

export async function getCollectionsView(
  companyId: string,
  condominiumId: string,
  today = new Date()
): Promise<CollectionsView> {
  return withTenantContext(companyId, async (tx) => {
    const charges = await tx.charge.findMany({
      where: { condominiumId, status: { in: ['pendiente', 'parcial'] } },
      select: {
        propertyId: true,
        amount: true,
        dueDate: true,
        allocations: { where: { payment: { status: 'aplicado' } }, select: { amount: true } },
      },
    });

    const aging = buildAging(
      charges.map((c) => ({
        propertyId: c.propertyId,
        outstanding: round2(Number(c.amount) - c.allocations.reduce((s, a) => s + Number(a.amount), 0)),
        dueDate: c.dueDate,
      })),
      today
    );

    const propertyIds = aging.byProperty.map((p) => p.propertyId);
    const [properties, plans, actions] = await Promise.all([
      tx.property.findMany({
        where: { id: { in: propertyIds } },
        select: {
          id: true,
          code: true,
          members: { select: { person: { select: { fullName: true } } }, take: 1 },
        },
      }),
      tx.paymentPlan.findMany({
        where: { condominiumId, status: 'vigente' },
        select: { propertyId: true },
      }),
      tx.collectionAction.findMany({
        where: { condominiumId, propertyId: { in: propertyIds } },
        orderBy: { createdAt: 'desc' },
        select: { propertyId: true, actionType: true, createdAt: true },
      }),
    ]);

    const byId = new Map(properties.map((p) => [p.id, p]));
    const withPlan = new Set(plans.map((p) => p.propertyId));
    const lastByProperty = new Map<string, { type: string; at: Date }>();
    for (const a of actions) {
      if (!lastByProperty.has(a.propertyId)) {
        lastByProperty.set(a.propertyId, { type: a.actionType, at: a.createdAt });
      }
    }

    const debtors: DebtorRow[] = aging.byProperty
      .filter((p) => p.oldestDays > 0)
      .map((p) => {
        const prop = byId.get(p.propertyId);
        const step = stepFor(p.oldestDays);
        return {
          propertyId: p.propertyId,
          code: prop?.code ?? '—',
          ownerName: prop?.members[0]?.person.fullName ?? null,
          total: round2(p.total),
          oldestDays: p.oldestDays,
          buckets: p.buckets,
          hasPlan: withPlan.has(p.propertyId),
          lastAction: lastByProperty.get(p.propertyId) ?? null,
          suggestedStep: step ? { type: step.type, label: step.label } : null,
        };
      });

    // Tasa de recuperación del mes en curso.
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const [charged, collected] = await Promise.all([
      tx.charge.aggregate({
        where: { condominiumId, status: { not: 'anulado' }, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      tx.payment.aggregate({
        where: { condominiumId, status: 'aplicado', paymentDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);
    const c = Number(charged._sum.amount ?? 0);
    const collectionRate = c > 0 ? Math.min(1, Number(collected._sum.amount ?? 0) / c) : 0;

    return { aging, debtors, collectionRate };
  });
}

export async function logCollectionAction(
  companyId: string,
  input: {
    condominiumId: string;
    propertyId: string;
    actionType: string;
    channel?: string;
    notes?: string;
    debtAmount?: number;
    daysOverdue?: number;
    automated?: boolean;
    userId?: string;
  }
) {
  return withTenantContext(companyId, (tx) =>
    tx.collectionAction.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        actionType: input.actionType as any,
        channel: input.channel || null,
        notes: input.notes || null,
        debtAmount: input.debtAmount ?? null,
        daysOverdue: input.daysOverdue ?? null,
        automated: input.automated ?? false,
        createdById: input.userId ?? null,
      },
    })
  );
}

export async function listActions(companyId: string, propertyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.collectionAction.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
  );
}

// ---------- Convenios de pago ----------

export async function listPaymentPlans(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.paymentPlan.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: { property: { select: { code: true } } },
    })
  );
}

export async function createPaymentPlan(
  companyId: string,
  userId: string,
  input: {
    condominiumId: string;
    propertyId: string;
    totalDebt: number;
    downPayment: number;
    installments: number;
    startDate: Date;
    notes?: string;
    documentUrl?: string;
    documentName?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const existing = await tx.paymentPlan.findFirst({
      where: { propertyId: input.propertyId, status: 'vigente' },
    });
    if (existing) throw new Error('Esta filial ya tiene un convenio vigente.');

    return tx.paymentPlan.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        totalDebt: input.totalDebt,
        downPayment: input.downPayment,
        installments: input.installments,
        startDate: input.startDate,
        notes: input.notes || null,
        documentUrl: input.documentUrl || null,
        documentName: input.documentName || null,
        approvedById: userId,
      },
    });
  });
}

export async function setPlanStatus(companyId: string, planId: string, status: string) {
  return withTenantContext(companyId, (tx) =>
    tx.paymentPlan.update({ where: { id: planId }, data: { status: status as any } })
  );
}

// ---------- Escalamiento automático ----------

export type CollectionRunSummary = {
  condominiums: number;
  evaluated: number;
  actions: number;
  skippedWithPlan: number;
};

/**
 * Registra la acción de cobro que corresponde a cada moroso, una sola
 * vez por escalón.
 *
 * Las filiales con convenio de pago vigente se SALTAN: perseguir con
 * avisos a quien está cumpliendo un arreglo firmado es la forma más
 * rápida de que lo abandone.
 */
export async function runCollectionLadder(today: Date): Promise<CollectionRunSummary> {
  // Corre desde el programador, sin sesión: recorre empresa por
  // empresa con el contexto de cada una.
  const condos = (
    await forEachCompany((tx) =>
      tx.condominium.findMany({
        where: { deletedAt: null },
        select: { id: true, companyId: true },
      })
    )
  ).flatMap((x) => x.result);

  const summary: CollectionRunSummary = {
    condominiums: condos.length,
    evaluated: 0,
    actions: 0,
    skippedWithPlan: 0,
  };

  for (const condo of condos) {
    const view = await getCollectionsView(condo.companyId, condo.id, today);
    summary.evaluated += view.debtors.length;

    for (const debtor of view.debtors) {
      if (debtor.hasPlan) {
        summary.skippedWithPlan += 1;
        continue;
      }
      if (!debtor.suggestedStep) continue;

      // Una sola acción por escalón: si ya se registró ese aviso, no
      // se repite todos los días.
      const already = await withTenantContext(condo.companyId, (tx) =>
        tx.collectionAction.findFirst({
          where: {
            propertyId: debtor.propertyId,
            actionType: debtor.suggestedStep!.type as any,
            automated: true,
          },
        })
      );
      if (already) continue;

      await logCollectionAction(condo.companyId, {
        condominiumId: condo.id,
        propertyId: debtor.propertyId,
        actionType: debtor.suggestedStep.type,
        channel: 'sistema',
        notes: debtor.suggestedStep.label,
        debtAmount: debtor.total,
        daysOverdue: debtor.oldestDays,
        automated: true,
      });
      summary.actions += 1;
    }
  }

  return summary;
}
