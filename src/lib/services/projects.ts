import { withTenantContext } from '@/lib/db';
import { recordProjectExpense } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';
import { EXECUTED_EXPENSE_STATUSES } from '@/lib/services/expenses';

/**
 * Qué gastos de Finanzas cuentan como ejecución de un proyecto.
 *
 * Solo lo aprobado o pagado, igual que en Presupuesto: un borrador o
 * algo por aprobar todavía no compromete plata, y un gasto anulado
 * nunca la comprometió. Es un alias de `EXECUTED_EXPENSE_STATUSES`,
 * no una segunda lista: eran dos copias del mismo literal y, el día
 * que una cambiara, Proyectos y Presupuesto habrían empezado a contar
 * cosas distintas sin que nada fallara.
 */
export const EXPENSE_EXECUTED = EXECUTED_EXPENSE_STATUSES;

export async function listProjects(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.project.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: {
        provider: { select: { name: true } },
        // Dos fuentes: el módulo retirado —cuyo historial sigue
        // contando— y los gastos de Finanzas imputados al proyecto,
        // que es la vía actual.
        expenses: { select: { amount: true } },
        financeExpenses: {
          where: { status: { in: [...EXPENSE_EXECUTED] } },
          select: { total: true },
        },
        _count: { select: { expenses: true, milestones: true } },
      },
    })
  );
}

/** Lo ejecutado de un proyecto: gastos heredados + gastos de Finanzas. */
export function projectSpent(project: {
  expenses?: { amount: unknown }[] | null;
  financeExpenses?: { total: unknown }[] | null;
}): number {
  const heredado = (project.expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const finanzas = (project.financeExpenses ?? []).reduce((s, e) => s + Number(e.total), 0);
  return heredado + finanzas;
}

export async function getProject(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) =>
    tx.project.findFirst({
      where: { id },
      include: {
        provider: true,
        condominium: { select: { currency: true } },
        milestones: { orderBy: { dueDate: 'asc' } },
        checklist: true,
        expenses: { orderBy: { expenseDate: 'desc' } },
        // Los gastos de Finanzas imputados al proyecto. Se traen TODOS
        // —no solo los ejecutados— para que el detalle muestre también
        // lo que está por aprobar: la cifra de ejecución solo cuenta lo
        // aprobado, pero quien mira el proyecto necesita ver lo que
        // viene en camino.
        financeExpenses: {
          orderBy: { issueDate: 'desc' },
          include: { supplier: { select: { legalName: true, tradeName: true } } },
        },
        updates: { orderBy: { createdAt: 'desc' } },
      },
    })
  );
}

export async function createProject(
  companyId: string,
  userId: string,
  userName: string,
  input: { condominiumId: string; name: string; description?: string; budget: number; startDate?: Date; endDate?: Date }
) {
  return withTenantContext(companyId, async (tx) => {
    const project = await tx.project.create({
      data: {
        condominiumId: input.condominiumId,
        name: input.name,
        description: input.description || null,
        budget: input.budget,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdById: userId,
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Proyectos', action: 'Proyecto creado', target: project.name });
    return project;
  });
}

export async function setProjectStatus(companyId: string, projectId: string, status: string) {
  return withTenantContext(companyId, (tx) => tx.project.update({ where: { id: projectId }, data: { status: status as any } }));
}

export async function addMilestone(companyId: string, projectId: string, title: string, dueDate?: Date) {
  return withTenantContext(companyId, (tx) => tx.projectMilestone.create({ data: { projectId, title, dueDate: dueDate ?? null } }));
}

export async function toggleMilestone(companyId: string, milestoneId: string, done: boolean) {
  return withTenantContext(companyId, (tx) =>
    tx.projectMilestone.update({ where: { id: milestoneId }, data: { status: done ? 'completado' : 'pendiente', completedAt: done ? new Date() : null } })
  );
}

export async function addChecklistItem(companyId: string, projectId: string, title: string) {
  return withTenantContext(companyId, (tx) => tx.projectChecklistItem.create({ data: { projectId, title } }));
}

export async function toggleChecklistItem(companyId: string, itemId: string, done: boolean) {
  return withTenantContext(companyId, (tx) => tx.projectChecklistItem.update({ where: { id: itemId }, data: { done } }));
}

/** El gasto se registra Y genera su asiento contable en la misma transacción. */
export async function addExpense(
  companyId: string,
  userId: string,
  userName: string,
  input: { projectId: string; condominiumId: string; description: string; amount: number }
) {
  return withTenantContext(companyId, async (tx) => {
    const expense = await tx.projectExpense.create({
      data: { projectId: input.projectId, description: input.description, amount: input.amount, createdById: userId },
    });
    await recordProjectExpense(tx, companyId, {
      expenseId: expense.id,
      condominiumId: input.condominiumId,
      description: input.description,
      amount: input.amount,
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Proyectos', action: 'Gasto de proyecto registrado', target: `${input.description} · ${input.amount}` });
    return expense;
  });
}

export async function addUpdate(
  companyId: string,
  userId: string,
  input: { projectId: string; description: string; progressPct?: number }
) {
  return withTenantContext(companyId, (tx) =>
    tx.projectUpdate.create({
      data: { projectId: input.projectId, description: input.description, progressPct: input.progressPct ?? null, createdById: userId },
    })
  );
}
