import { withTenantContext } from '@/lib/db';
import type { Destination } from '@/lib/services/file-refs';

/**
 * A qué condominio pertenece cada cosa.
 *
 * Cuando una acción recibe solo el identificador de una entidad —una
 * reserva, un activo, una visita— el condominio se toma de la entidad
 * misma, nunca de un campo del formulario: el navegador puede
 * cambiarlo. Con ese condominio en la mano, `requirePanel` puede
 * comprobar si quien pide la operación tiene derecho a ese condominio.
 *
 * Todas pasan por `withTenantContext` y acotan además por `companyId`,
 * así que un identificador de otra empresa no resuelve nada: lanzan en
 * vez de devolver un condominio ajeno.
 */

export async function condoOfAsset(companyId: string, assetId: string): Promise<string> {
  const asset = await withTenantContext(companyId, (tx) =>
    tx.asset.findFirstOrThrow({
      where: { id: assetId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return asset.condominiumId;
}

export async function condoOfAssetCategory(companyId: string, categoryId: string): Promise<string> {
  const category = await withTenantContext(companyId, (tx) =>
    tx.assetCategoryOption.findFirstOrThrow({
      where: { id: categoryId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return category.condominiumId;
}

export async function condoOfAmenity(companyId: string, amenityId: string): Promise<string> {
  const amenity = await withTenantContext(companyId, (tx) =>
    tx.amenity.findFirstOrThrow({
      where: { id: amenityId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return amenity.condominiumId;
}

export async function condoOfTask(companyId: string, taskId: string): Promise<string | null> {
  const task = await withTenantContext(companyId, (tx) =>
    tx.adminTask.findFirstOrThrow({
      where: { id: taskId, companyId },
      select: { condominiumId: true },
    })
  );
  return task.condominiumId;
}

/** Condominio de una autorización de visita. */
export async function condoOfVisit(companyId: string, authorizationId: string): Promise<string> {
  const visit = await withTenantContext(companyId, (tx) =>
    tx.visitAuthorization.findFirstOrThrow({
      where: { id: authorizationId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return visit.condominiumId;
}

/** Condominio de un ingreso registrado (por su autorización). */
export async function condoOfCheckin(companyId: string, checkinId: string): Promise<string> {
  const checkin = await withTenantContext(companyId, (tx) =>
    tx.visitCheckin.findFirstOrThrow({
      where: { id: checkinId, authorization: { condominium: { companyId } } },
      select: { authorization: { select: { condominiumId: true } } },
    })
  );
  return checkin.authorization.condominiumId;
}

export async function condoOfReservation(companyId: string, reservationId: string): Promise<string> {
  const reservation = await withTenantContext(companyId, (tx) =>
    tx.reservation.findFirstOrThrow({
      where: { id: reservationId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return reservation.condominiumId;
}

export async function condoOfSchedule(companyId: string, scheduleId: string): Promise<string> {
  const schedule = await withTenantContext(companyId, (tx) =>
    tx.amenitySchedule.findFirstOrThrow({
      where: { id: scheduleId, amenity: { condominium: { companyId } } },
      select: { amenity: { select: { condominiumId: true } } },
    })
  );
  return schedule.amenity.condominiumId;
}

export async function condoOfProperty(companyId: string, propertyId: string): Promise<string> {
  const property = await withTenantContext(companyId, (tx) =>
    tx.property.findFirstOrThrow({
      where: { id: propertyId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return property.condominiumId;
}

export async function condoOfMember(companyId: string, memberId: string): Promise<string> {
  const member = await withTenantContext(companyId, (tx) =>
    tx.propertyMember.findFirstOrThrow({
      where: { id: memberId, property: { condominium: { companyId } } },
      select: { property: { select: { condominiumId: true } } },
    })
  );
  return member.property.condominiumId;
}

export async function condoOfIncident(companyId: string, incidentId: string): Promise<string> {
  const incident = await withTenantContext(companyId, (tx) =>
    tx.incident.findFirstOrThrow({
      where: { id: incidentId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return incident.condominiumId;
}

export async function condoOfPackage(companyId: string, packageId: string): Promise<string> {
  const pkg = await withTenantContext(companyId, (tx) =>
    tx.package.findFirstOrThrow({
      where: { id: packageId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return pkg.condominiumId;
}

export async function condoOfTicket(companyId: string, ticketId: string): Promise<string> {
  const ticket = await withTenantContext(companyId, (tx) =>
    tx.maintenanceTicket.findFirstOrThrow({
      where: { id: ticketId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return ticket.condominiumId;
}

export async function condoOfProvider(companyId: string, providerId: string): Promise<string> {
  const provider = await withTenantContext(companyId, (tx) =>
    tx.provider.findFirstOrThrow({
      where: { id: providerId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return provider.condominiumId;
}

/** Condominio de un punto del checklist de una tarea (puede no tener). */
export async function condoOfChecklistItem(companyId: string, itemId: string): Promise<string | null> {
  const item = await withTenantContext(companyId, (tx) =>
    tx.adminTaskChecklistItem.findFirstOrThrow({
      where: { id: itemId, task: { companyId } },
      select: { task: { select: { condominiumId: true } } },
    })
  );
  return item.task.condominiumId;
}

/** Condominio de un adjunto de tarea (puede no tener). */
export async function condoOfTaskAttachment(companyId: string, attachmentId: string): Promise<string | null> {
  const att = await withTenantContext(companyId, (tx) =>
    tx.adminTaskAttachment.findFirstOrThrow({
      where: { id: attachmentId, task: { companyId } },
      select: { task: { select: { condominiumId: true } } },
    })
  );
  return att.task.condominiumId;
}

export async function condoOfAssembly(companyId: string, assemblyId: string): Promise<string> {
  const assembly = await withTenantContext(companyId, (tx) =>
    tx.assembly.findFirstOrThrow({
      where: { id: assemblyId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return assembly.condominiumId;
}

export async function condoOfAssemblyTopic(companyId: string, topicId: string): Promise<string> {
  const topic = await withTenantContext(companyId, (tx) =>
    tx.assemblyTopic.findFirstOrThrow({
      where: { id: topicId, assembly: { condominium: { companyId } } },
      select: { assembly: { select: { condominiumId: true } } },
    })
  );
  return topic.assembly.condominiumId;
}

export async function condoOfProject(companyId: string, projectId: string): Promise<string> {
  const project = await withTenantContext(companyId, (tx) =>
    tx.project.findFirstOrThrow({
      where: { id: projectId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return project.condominiumId;
}

/** Condominio de un ítem del checklist de un proyecto. */
export async function condoOfProjectChecklistItem(companyId: string, itemId: string): Promise<string> {
  const item = await withTenantContext(companyId, (tx) =>
    tx.projectChecklistItem.findFirstOrThrow({
      where: { id: itemId, project: { condominium: { companyId } } },
      select: { project: { select: { condominiumId: true } } },
    })
  );
  return item.project.condominiumId;
}

/** Condominio de una asignación de supervisor. */
export async function condoOfSupervisor(companyId: string, supervisorId: string): Promise<string> {
  const supervisor = await withTenantContext(companyId, (tx) =>
    tx.condominiumSupervisor.findFirstOrThrow({
      where: { id: supervisorId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return supervisor.condominiumId;
}

/** Condominio de una solicitud de emisión de documento (certificación/estado de cuenta). */
export async function condoOfDocumentRequest(companyId: string, requestId: string): Promise<string> {
  const request = await withTenantContext(companyId, (tx) =>
    tx.documentRequest.findFirstOrThrow({
      where: { id: requestId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return request.condominiumId;
}

/** Condominio de un expediente de incumplimiento. */
export async function condoOfViolationCase(companyId: string, caseId: string): Promise<string> {
  const violationCase = await withTenantContext(companyId, (tx) =>
    tx.violationCase.findFirstOrThrow({
      where: { id: caseId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return violationCase.condominiumId;
}

/** Condominio de un gasto (por su `expenseId`). */
export async function condoOfExpense(companyId: string, expenseId: string): Promise<string> {
  const expense = await withTenantContext(companyId, (tx) =>
    tx.expense.findFirstOrThrow({
      where: { id: expenseId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return expense.condominiumId;
}

export async function condoOfDocument(companyId: string, documentId: string): Promise<string> {
  const doc = await withTenantContext(companyId, (tx) =>
    tx.document.findFirstOrThrow({
      where: { id: documentId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return doc.condominiumId;
}

export async function condoOfCommunication(companyId: string, communicationId: string): Promise<string> {
  const comm = await withTenantContext(companyId, (tx) =>
    tx.communication.findFirstOrThrow({
      where: { id: communicationId, condominium: { companyId } },
      select: { condominiumId: true },
    })
  );
  return comm.condominiumId;
}

/**
 * Una persona pertenece a la empresa, no a un condominio: puede ser
 * miembro de unidades en varios. Devuelve los condominios donde tiene
 * presencia, para exigir que quien la edite tenga acceso a alguno.
 */
export async function condosOfPerson(companyId: string, personId: string): Promise<string[]> {
  const person = await withTenantContext(companyId, (tx) =>
    tx.person.findFirstOrThrow({
      where: { id: personId, companyId },
      select: { memberships: { select: { property: { select: { condominiumId: true } } } } },
    })
  );
  return [...new Set(person.memberships.map((m) => m.property.condominiumId))];
}

/**
 * Los adjuntos de una tarea van a la carpeta del condominio si la tarea
 * tiene uno; si no, a una carpeta de la empresa. Una tarea puede ser
 * administrativa y no pertenecer a ningún condominio.
 */
export function taskDestination(condominiumId?: string | null): Destination {
  return condominiumId
    ? { kind: 'condo', condominiumId, slug: 'administracion' }
    : { kind: 'company', slug: 'tareas', name: 'Adjuntos de tareas' };
}
