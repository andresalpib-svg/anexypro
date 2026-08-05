import { withTenantContext, forEachCompany } from '@/lib/db';
import { CATEGORY_ACCOUNT } from '@/lib/services/expenses';

/**
 * Gastos recurrentes y contratos.
 *
 * El proceso automático crea los gastos en BORRADOR unos días antes
 * del vencimiento. Nunca los aprueba: el monto de un servicio varía
 * mes a mes y alguien tiene que verlo antes de que impacte los
 * estados financieros.
 */

const MONTHS_BY_FREQUENCY: Record<string, number> = {
  mensual: 1,
  bimensual: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Próxima fecha de vencimiento a partir de la última generación. */
export function nextDueDate(
  frequency: string,
  dayOfMonth: number,
  from: Date,
  lastGenerated: Date | null
): Date {
  const step = MONTHS_BY_FREQUENCY[frequency] ?? 1;
  const base = lastGenerated ?? from;
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();

  // Si nunca se generó, el primer vencimiento es el del mes de inicio.
  const targetMonth = lastGenerated ? m + step : m;
  // El día se recorta al último del mes: un recurrente el día 31 no
  // puede caer en febrero.
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, targetMonth, Math.min(dayOfMonth, lastDay)));
}

export async function listRecurring(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.recurringExpense.findMany({
      where: { condominiumId },
      orderBy: [{ isActive: 'desc' }, { description: 'asc' }],
      include: { supplier: { select: { legalName: true, tradeName: true } }, contract: true },
    })
  );
}

export async function upsertRecurring(
  companyId: string,
  input: {
    id?: string;
    condominiumId: string;
    supplierId?: string;
    description: string;
    category: string;
    amount: number;
    frequency: string;
    dayOfMonth: number;
    leadDays: number;
    startDate: Date;
    endDate?: Date | null;
    isActive: boolean;
  }
) {
  return withTenantContext(companyId, (tx) => {
    const data = {
      condominiumId: input.condominiumId,
      supplierId: input.supplierId || null,
      description: input.description,
      category: input.category as any,
      amount: input.amount,
      frequency: input.frequency as any,
      dayOfMonth: input.dayOfMonth,
      leadDays: input.leadDays,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      isActive: input.isActive,
    };
    return input.id
      ? tx.recurringExpense.update({ where: { id: input.id }, data })
      : tx.recurringExpense.create({ data: { companyId, ...data } });
  });
}

export async function deleteRecurring(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) => tx.recurringExpense.delete({ where: { id } }));
}

export type RecurringRunSummary = { evaluated: number; created: number; skipped: number };

/**
 * Genera los gastos en borrador que ya entran en su ventana de
 * antelación. Idempotente: si el gasto de ese vencimiento ya existe,
 * no lo repite.
 */
export async function generateRecurringExpenses(today: Date): Promise<RecurringRunSummary> {
  // Corre desde el programador, sin sesión: empresa por empresa.
  const items = (
    await forEachCompany((tx) =>
      tx.recurringExpense.findMany({
        where: {
          isActive: true,
          startDate: { lte: today },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        include: { condominium: { select: { companyId: true } } },
      })
    )
  ).flatMap((x) => x.result);

  const summary: RecurringRunSummary = { evaluated: items.length, created: 0, skipped: 0 };

  for (const item of items) {
    const due = nextDueDate(item.frequency, item.dayOfMonth, item.startDate, item.lastGenerated);
    const window = new Date(due.getTime() - item.leadDays * 86_400_000);
    if (today < window) {
      summary.skipped += 1;
      continue;
    }

    const companyId = item.condominium.companyId;
    await withTenantContext(companyId, async (tx) => {
      // Guarda de idempotencia: mismo recurrente + misma fecha de
      // vencimiento = mismo gasto.
      const exists = await tx.expense.findFirst({
        where: { recurringId: item.id, dueDate: due },
        select: { id: true },
      });
      if (exists) {
        summary.skipped += 1;
        return;
      }

      const last = await tx.expense.aggregate({
        where: { condominiumId: item.condominiumId },
        _max: { expenseNumber: true },
      });

      await tx.expense.create({
        data: {
          companyId,
          condominiumId: item.condominiumId,
          supplierId: item.supplierId,
          expenseNumber: (last._max.expenseNumber ?? 0) + 1,
          category: item.category,
          accountCode: CATEGORY_ACCOUNT[item.category] ?? CATEGORY_ACCOUNT.otro!,
          description: item.description,
          issueDate: due,
          dueDate: due,
          subtotal: item.amount,
          taxAmount: 0,
          total: item.amount,
          // SIEMPRE en borrador: el monto puede variar y nadie lo revisó.
          status: 'borrador',
          recurringId: item.id,
          notes: 'Generado automáticamente desde un gasto recurrente. Revisá el monto antes de aprobarlo.',
        },
      });
      await tx.recurringExpense.update({
        where: { id: item.id },
        data: { lastGenerated: due },
      });
      summary.created += 1;
    });
  }

  return summary;
}

// ---------- Contratos ----------

export async function listContracts(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.contract.findMany({
      where: { condominiumId },
      orderBy: { endDate: 'asc' },
      include: { supplier: { select: { legalName: true, tradeName: true } } },
    })
  );
}

export async function upsertContract(
  companyId: string,
  input: {
    id?: string;
    condominiumId: string;
    supplierId: string;
    title: string;
    serviceType: string;
    startDate: Date;
    endDate: Date;
    monthlyAmount?: number | null;
    autoRenew: boolean;
    noticeDays: number;
    documentUrl?: string;
    documentName?: string;
    notes?: string;
  }
) {
  return withTenantContext(companyId, (tx) => {
    const data = {
      condominiumId: input.condominiumId,
      supplierId: input.supplierId,
      title: input.title,
      serviceType: input.serviceType,
      startDate: input.startDate,
      endDate: input.endDate,
      monthlyAmount: input.monthlyAmount ?? null,
      autoRenew: input.autoRenew,
      noticeDays: input.noticeDays,
      ...(input.documentUrl ? { documentUrl: input.documentUrl, documentName: input.documentName } : {}),
      notes: input.notes || null,
    };
    return input.id
      ? tx.contract.update({ where: { id: input.id }, data })
      : tx.contract.create({ data: { companyId, ...data } });
  });
}

export async function deleteContract(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) => tx.contract.delete({ where: { id } }));
}

export type ContractRunSummary = { evaluated: number; porVencer: number; vencidos: number };

/**
 * Actualiza el estado de los contratos según su fecha.
 * `por_vencer` se activa cuando entra en la ventana de aviso.
 */
export async function refreshContractStatuses(today: Date): Promise<ContractRunSummary> {
  const contracts = (
    await forEachCompany((tx) =>
      tx.contract.findMany({
        where: { status: { in: ['vigente', 'por_vencer'] } },
        select: { id: true, endDate: true, noticeDays: true, status: true, companyId: true },
      })
    )
  ).flatMap((x) => x.result);

  const summary: ContractRunSummary = { evaluated: contracts.length, porVencer: 0, vencidos: 0 };

  for (const c of contracts) {
    const days = Math.floor((c.endDate.getTime() - today.getTime()) / 86_400_000);
    let status: 'vigente' | 'por_vencer' | 'vencido' = 'vigente';
    if (days < 0) status = 'vencido';
    else if (days <= c.noticeDays) status = 'por_vencer';

    if (status !== c.status) {
      await withTenantContext(c.companyId, (tx) =>
        tx.contract.update({ where: { id: c.id }, data: { status } })
      );
    }
    if (status === 'por_vencer') summary.porVencer += 1;
    if (status === 'vencido') summary.vencidos += 1;
  }

  return summary;
}

/** Contratos que vencen pronto — alimenta las alertas del panel. */
export async function listExpiringContracts(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.contract.findMany({
      where: { condominiumId, status: { in: ['por_vencer', 'vencido'] } },
      orderBy: { endDate: 'asc' },
      include: { supplier: { select: { legalName: true, tradeName: true } } },
    })
  );
}
