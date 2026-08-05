import { withTenantContext } from '@/lib/db';
import { recordProjectExpense } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';

export async function listProjects(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.project.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: {
        provider: { select: { name: true } },
        expenses: { select: { amount: true } },
        _count: { select: { expenses: true, milestones: true } },
      },
    })
  );
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
