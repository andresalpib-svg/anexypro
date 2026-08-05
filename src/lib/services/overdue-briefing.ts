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

/**
 * Tope de elementos que se detallan en el aviso. Los contadores del
 * encabezado siguen siendo los totales reales, así que si hay más el
 * usuario lo ve; lo que no tiene sentido es traer —y dibujar— cientos
 * de filas en una ventana que se lee de un vistazo.
 */
const MAX_ITEMS = 25;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días completos de atraso respecto a hoy (fecha calendario). */
function daysSince(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - d.getTime()) / DAY_MS);
}

/** Lo que devuelve el aviso cuando no hay nada que mostrar. */
export const SIN_ATRASOS: OverdueBriefing = { items: [], taskCount: 0, ticketCount: 0 };

/**
 * ¿Hace falta calcular el aviso, o ya se vio hoy?
 *
 * El aviso se muestra una sola vez al día, pero se calculaba en CADA
 * navegación del panel — dos consultas sin límite que el 99 % de las
 * veces se descartaban. Leyendo la cookie en el servidor nos las
 * ahorramos.
 *
 * La cookie la escribe el navegador con SU fecha local. Aquí se compara
 * con la fecha local del servidor, que en producción es UTC: durante
 * las últimas horas del día en Costa Rica las dos no coinciden y el
 * cálculo se hace igual. Es a propósito — ante la duda se calcula, y el
 * cliente decide si lo enseña. Nunca deja de avisar por esta causa.
 */
export function avisoYaVistoHoy(valorCookie: string | undefined): boolean {
  if (!valorCookie) return false;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return valorCookie === `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function getOverdueBriefing(companyId: string): Promise<OverdueBriefing> {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() - OVERDUE_DAYS_THRESHOLD);

  return withTenantContext(companyId, async (tx) => {
    const dondeTareas = {
      companyId,
      status: { not: 'completada' as const },
      dueDate: { not: null, lte: new Date(`${limit.toISOString().slice(0, 10)}T00:00:00Z`) },
    };
    const dondeTickets = {
      condominium: { companyId, deletedAt: null },
      status: { notIn: ['completado' as const, 'cancelado' as const] },
      createdAt: { lte: limit },
    };

    // Las listas van acotadas; los contadores se piden aparte para que
    // el encabezado siga diciendo el total real.
    const [tasks, tickets, taskCount, ticketCount] = await Promise.all([
      tx.adminTask.findMany({
        where: dondeTareas,
        include: { assignedTo: { select: { fullName: true } } },
        orderBy: { dueDate: 'asc' },
        take: MAX_ITEMS,
      }),
      tx.maintenanceTicket.findMany({
        where: dondeTickets,
        include: { condominium: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        take: MAX_ITEMS,
      }),
      tx.adminTask.count({ where: dondeTareas }),
      tx.maintenanceTicket.count({ where: dondeTickets }),
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

    return { items: items.slice(0, MAX_ITEMS), taskCount, ticketCount };
  });
}
