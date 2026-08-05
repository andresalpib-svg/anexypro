import { withTenantContext } from '@/lib/db';

/**
 * Resumen de atrasos para la administración y la supervisión.
 *
 * Regla: se avisa de todo lo que acumula 2 O MÁS DÍAS de atraso —
 * tareas internas (por su fecha límite) y tickets de mantenimiento,
 * tanto internos como reportados por residentes (por el tiempo que
 * llevan abiertos sin resolverse).
 *
 * El aviso se muestra UNA VEZ AL DÍA, en el primer ingreso: la fecha
 * del último aviso visto vive en una cookie (ver overdue-modal.tsx).
 */

export const OVERDUE_DAYS_THRESHOLD = 2;

export type OverdueItem = {
  id: string;
  kind: 'tarea' | 'ticket';
  title: string;
  reference: string; // responsable o condominio
  daysLate: number;
  priority: string;
  origin?: 'residente' | 'interno';
};

export type OverdueBriefing = {
  items: OverdueItem[];
  taskCount: number;
  ticketCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días completos de atraso respecto a hoy (fecha calendario). */
function daysSince(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / DAY_MS);
}

export async function getOverdueBriefing(companyId: string): Promise<OverdueBriefing> {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() - OVERDUE_DAYS_THRESHOLD);

  return withTenantContext(companyId, async (tx) => {
    const [tasks, tickets] = await Promise.all([
      tx.adminTask.findMany({
        where: {
          companyId,
          status: { not: 'completada' },
          dueDate: { not: null, lte: new Date(`${limit.toISOString().slice(0, 10)}T00:00:00Z`) },
        },
        include: { assignedTo: { select: { fullName: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      tx.maintenanceTicket.findMany({
        where: {
          condominium: { companyId, deletedAt: null },
          status: { notIn: ['completado', 'cancelado'] },
          createdAt: { lte: limit },
        },
        include: { condominium: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const items: OverdueItem[] = [
      ...tasks.map((t) => ({
        id: t.id,
        kind: 'tarea' as const,
        title: t.title,
        reference: t.assignedTo?.fullName ?? 'Sin asignar',
        daysLate: daysSince(t.dueDate!),
        priority: t.priority,
      })),
      ...tickets.map((t) => ({
        id: t.id,
        kind: 'ticket' as const,
        title: t.title,
        reference: t.condominium.name,
        daysLate: daysSince(t.createdAt),
        priority: t.priority,
        // Los tickets nacidos de un incidente reportado por un
        // residente se distinguen de los creados por el equipo.
        origin: (t.source === 'incidente' ? 'residente' : 'interno') as 'residente' | 'interno',
      })),
    ].sort((a, b) => b.daysLate - a.daysLate);

    return { items, taskCount: tasks.length, ticketCount: tickets.length };
  });
}
