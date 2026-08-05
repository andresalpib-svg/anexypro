import { withTenantContext } from '@/lib/db';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { countPendingTasksForSession } from '@/lib/services/tasks';

type SessionLike = { user: { id: string; companyId: string; role: string } };

/**
 * Panel del supervisor: todo lo que necesita atender hoy, acotado a
 * los condominios que tiene asignados.
 *
 * Los tickets se separan por origen: los que abrieron los residentes
 * (`source = incidente`) exigen respuesta hacia afuera; los que abrió
 * el personal son trabajo interno. Mezclarlos escondería los primeros.
 */
export async function getSupervisorDashboard(session: SessionLike) {
  const { companyId } = session.user;
  const condos = await listCondominiumsForSession(session);
  const condoIds = condos.map((c) => c.id);

  if (condoIds.length === 0) {
    return {
      condos,
      pendingTasks: 0,
      documentRequests: [],
      pendingReservations: [],
      residentTickets: [],
      staffTickets: [],
    };
  }

  const [pendingTasks, documentRequests, pendingReservations, residentTickets, staffTickets] =
    await Promise.all([
      countPendingTasksForSession(session),

      withTenantContext(companyId, (tx) =>
        tx.documentRequest.findMany({
          where: { status: 'solicitada', condominiumId: { in: condoIds } },
          orderBy: { requestedAt: 'asc' },
          take: 8,
          include: {
            property: { select: { code: true } },
            condominium: { select: { name: true } },
            person: { select: { fullName: true } },
          },
        })
      ),

      withTenantContext(companyId, (tx) =>
        tx.reservation.findMany({
          where: { status: 'pendiente_aprobacion', amenity: { condominiumId: { in: condoIds } } },
          orderBy: { resDate: 'asc' },
          take: 8,
          include: {
            amenity: { select: { name: true, condominium: { select: { name: true } } } },
            property: { select: { code: true } },
          },
        })
      ),

      withTenantContext(companyId, (tx) =>
        tx.maintenanceTicket.findMany({
          where: {
            condominiumId: { in: condoIds },
            source: 'incidente',
            status: { notIn: ['completado', 'cancelado'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { condominium: { select: { name: true } } },
        })
      ),

      withTenantContext(companyId, (tx) =>
        tx.maintenanceTicket.findMany({
          where: {
            condominiumId: { in: condoIds },
            source: { not: 'incidente' },
            status: { notIn: ['completado', 'cancelado'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { condominium: { select: { name: true } } },
        })
      ),
    ]);

  return { condos, pendingTasks, documentRequests, pendingReservations, residentTickets, staffTickets };
}
