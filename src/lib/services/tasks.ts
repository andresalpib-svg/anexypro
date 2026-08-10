import { withTenantContext } from '@/lib/db';
import { listCondominiumsForSession } from '@/lib/services/condominiums';

export type TaskInput = {
  title: string;
  category?: string;
  assignedToId?: string;
  condominiumId?: string;
  priority: string;
  dueDate?: Date | null;
  alarmAt?: Date | null;
  notes?: string;
};

export async function listTasks(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.findMany({
      where: { companyId },
      orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        condominium: { select: { id: true, name: true } },
        checklist: { orderBy: { sortOrder: 'asc' } },
        attachments: { orderBy: { uploadedAt: 'asc' } },
      },
    })
  );
}

/**
 * Qué tareas alcanza el usuario de la sesión.
 *
 * La administración (admin_owner) ve todo. El supervisor (admin_staff)
 * ve TRES cosas: las que le asignaron, las que él creó y **las de los
 * condominios que administra**, aunque las haya abierto otra persona o
 * no tengan responsable.
 *
 * Ese tercer caso faltaba y dejaba un hueco real: una tarea de su
 * condominio creada por la administración y sin asignar no le aparecía
 * a nadie —el supervisor no la veía y el aviso de atrasos tampoco se
 * la mostraba—, aunque las acciones de escritura SÍ le permitían
 * cerrarla (`guardByCondo` autoriza por condominio asignado). Se veía
 * menos de lo que se podía hacer.
 *
 * Se resuelve en un solo sitio para que la lista, el contador y el
 * aviso de atrasos no puedan discrepar entre ellos.
 */
export async function taskScopeForSession(session: {
  user: { id: string; companyId: string; role: string };
}) {
  const { id, role } = session.user;
  if (role !== 'admin_staff') return {};

  const condoIds = (await listCondominiumsForSession(session)).map((c) => c.id);
  return {
    OR: [
      { assignedToId: id },
      { createdById: id },
      // Sin condominios asignados esta rama no se agrega: un `in: []`
      // no aporta nada y confunde al leer la consulta.
      ...(condoIds.length > 0 ? [{ condominiumId: { in: condoIds } }] : []),
    ],
  };
}

/** Tareas visibles para el usuario de la sesión. */
export async function listTasksForSession(session: {
  user: { id: string; companyId: string; role: string };
}) {
  const { companyId } = session.user;
  const alcance = await taskScopeForSession(session);
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.findMany({
      where: { companyId, ...alcance },
      orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        assignedTo: { select: { id: true, fullName: true } },
        condominium: { select: { id: true, name: true } },
        checklist: { orderBy: { sortOrder: 'asc' } },
        attachments: { orderBy: { uploadedAt: 'asc' } },
      },
    })
  );
}

/** Cuántas tareas tiene el usuario sin terminar. */
export async function countPendingTasksForSession(session: {
  user: { id: string; companyId: string; role: string };
}) {
  const { companyId } = session.user;
  const alcance = await taskScopeForSession(session);
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.count({
      where: {
        companyId,
        status: { in: ['pendiente', 'en_progreso'] },
        ...alcance,
      },
    })
  );
}

export async function listAdminUsers(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.user.findMany({
      where: { companyId, role: { in: ['admin_owner', 'admin_staff'] }, status: 'activo' },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    })
  );
}

export async function createTask(companyId: string, userId: string, input: TaskInput) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.create({
      data: {
        companyId,
        title: input.title,
        category: input.category || null,
        assignedToId: input.assignedToId || null,
        condominiumId: input.condominiumId || null,
        priority: input.priority as any,
        dueDate: input.dueDate ?? null,
        alarmAt: input.alarmAt ?? null,
        notes: input.notes || null,
        createdById: userId,
      },
    })
  );
}

export async function updateTask(companyId: string, taskId: string, input: TaskInput & { status: string }) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.update({
      where: { id: taskId },
      data: {
        title: input.title,
        category: input.category || null,
        assignedToId: input.assignedToId || null,
        condominiumId: input.condominiumId || null,
        priority: input.priority as any,
        dueDate: input.dueDate ?? null,
        alarmAt: input.alarmAt ?? null,
        notes: input.notes || null,
        status: input.status as any,
      },
    })
  );
}

export async function setTaskStatus(companyId: string, taskId: string, status: string) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTask.update({ where: { id: taskId }, data: { status: status as any } })
  );
}

export async function deleteTask(companyId: string, taskId: string) {
  return withTenantContext(companyId, (tx) => tx.adminTask.delete({ where: { id: taskId } }));
}

// ---------- Checklist ----------
export async function addChecklistItem(companyId: string, taskId: string, title: string) {
  return withTenantContext(companyId, async (tx) => {
    const max = await tx.adminTaskChecklistItem.aggregate({ where: { taskId }, _max: { sortOrder: true } });
    return tx.adminTaskChecklistItem.create({
      data: { taskId, title, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  });
}

export async function toggleChecklistItem(companyId: string, itemId: string, done: boolean) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTaskChecklistItem.update({ where: { id: itemId }, data: { done } })
  );
}

export async function deleteChecklistItem(companyId: string, itemId: string) {
  return withTenantContext(companyId, (tx) => tx.adminTaskChecklistItem.delete({ where: { id: itemId } }));
}

// ---------- Adjuntos ----------
export async function addTaskAttachment(companyId: string, taskId: string, fileName: string, fileUrl: string) {
  return withTenantContext(companyId, (tx) =>
    tx.adminTaskAttachment.create({ data: { taskId, fileName, fileUrl } })
  );
}

export async function deleteTaskAttachment(companyId: string, attachmentId: string) {
  return withTenantContext(companyId, (tx) => tx.adminTaskAttachment.delete({ where: { id: attachmentId } }));
}

// ---------- Notificaciones (campana del topbar) ----------
export type TaskNotification = {
  taskId: string;
  title: string;
  kind: 'vencida' | 'vence_hoy' | 'alarma';
  when: Date;
};

/**
 * Avisos activos:
 *  - OBLIGATORIO: toda tarea no completada avisa en su fecha límite
 *    (y sigue avisando mientras esté vencida).
 *  - Alarma adicional configurable (alarmAt), si ya llegó su hora.
 */
export async function getTaskNotifications(companyId: string): Promise<TaskNotification[]> {
  const now = new Date();
  // dueDate es @db.Date (medianoche UTC): se compara por fecha
  // calendario local, no por instante, para no correrse un día.
  const p = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const dueLimit = new Date(`${todayStr}T00:00:00Z`); // hoy (UTC-midnight) o antes

  const tasks = await withTenantContext(companyId, (tx) =>
    tx.adminTask.findMany({
      where: {
        companyId,
        status: { not: 'completada' },
        OR: [{ dueDate: { lte: dueLimit } }, { alarmAt: { lte: now } }],
      },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      select: { id: true, title: true, dueDate: true, alarmAt: true },
    })
  );

  return tasks.flatMap((t): TaskNotification[] => {
    const dueStr = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null;
    if (dueStr && dueStr < todayStr) return [{ taskId: t.id, title: t.title, kind: 'vencida' as const, when: t.dueDate! }];
    if (dueStr && dueStr === todayStr) return [{ taskId: t.id, title: t.title, kind: 'vence_hoy' as const, when: t.dueDate! }];
    if (t.alarmAt && t.alarmAt <= now) return [{ taskId: t.id, title: t.title, kind: 'alarma' as const, when: t.alarmAt }];
    return [];
  });
}

/**
 * Tareas agrupadas para el resumen del calendario: hoy, resto de la
 * semana (dom–sáb) y resto del mes. Fechas @db.Date comparadas por
 * día calendario UTC.
 */
export async function getTaskBuckets(companyId: string) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const dstr = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const today = dstr(now);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (6 - now.getDay()));
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const tasks = await withTenantContext(companyId, (tx) =>
    tx.adminTask.findMany({
      where: {
        companyId,
        status: { not: 'completada' },
        dueDate: { not: null, lte: new Date(`${dstr(monthEnd)}T00:00:00Z`) },
      },
      orderBy: { dueDate: 'asc' },
      include: { assignedTo: { select: { fullName: true } } },
    })
  );

  const buckets = { hoy: [] as typeof tasks, semana: [] as typeof tasks, mes: [] as typeof tasks };
  for (const t of tasks) {
    const due = t.dueDate!.toISOString().slice(0, 10);
    if (due <= today) buckets.hoy.push(t); // incluye vencidas
    else if (due <= dstr(weekEnd)) buckets.semana.push(t);
    else buckets.mes.push(t);
  }
  return buckets;
}
