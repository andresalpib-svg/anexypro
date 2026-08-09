import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

export async function listCommunications(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.communication.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { recipients: true } }, targets: true },
    })
  );
}

export async function getCommunication(companyId: string, id: string) {
  return withTenantContext(companyId, async (tx) => {
    const comm = await tx.communication.findFirst({
      where: { id },
      include: { recipients: { include: { person: true } }, targets: true, attachments: { orderBy: { uploadedAt: 'asc' } } },
    });
    if (!comm) return null;
    const reads = comm.recipients.filter((r) => r.readAt !== null).length;
    return { ...comm, stats: { total: comm.recipients.length, reads } };
  });
}

/**
 * Crea el comunicado como borrador. La resolución real de
 * destinatarios ocurre en publishCommunication — antes de publicar,
 * "todos" o "por rol" son solo una INTENCIÓN (communication_targets),
 * no una lista todavía, igual que en el prototipo.
 */
export async function createCommunication(
  companyId: string,
  userId: string,
  userName: string,
  input: {
    condominiumId: string;
    title: string;
    body: string;
    category: string;
    targetType: 'todos' | 'rol';
    targetRole?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const comm = await tx.communication.create({
      data: {
        condominiumId: input.condominiumId,
        title: input.title,
        body: input.body,
        category: input.category as any,
        status: 'borrador',
        createdById: userId,
        targets: {
          create:
            input.targetType === 'todos'
              ? [{ targetType: 'todos' }]
              : [{ targetType: 'rol', role: input.targetRole }],
        },
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Comunicados', action: 'Borrador creado', target: comm.title });
    return comm;
  });
}

/**
 * Publica: resuelve la audiencia real en este momento (snapshot),
 * crea communication_recipients uno por persona, y crea el evento en
 * el Calendario General si el comunicado trae una fecha relevante
 * (no aplica en esta primera pasada — se deja documentado).
 */
export async function markCommunicationRead(companyId: string, communicationId: string, personId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.communicationRecipient.updateMany({
      where: { communicationId, personId, readAt: null },
      data: { readAt: new Date() },
    })
  );
}

export async function listMyCommunications(companyId: string, personId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.communicationRecipient.findMany({
      where: { personId },
      include: { communication: { include: { attachments: { orderBy: { uploadedAt: 'asc' } } } } },
      orderBy: { deliveredAt: 'desc' },
    })
  );
}

/**
 * Comunicados del condominio que ya estaban publicados cuando esta
 * persona entró — los que nunca le fueron entregados porque todavía no
 * era residente.
 *
 * POR QUÉ EXISTE: los destinatarios son una foto del momento de
 * publicar, así que un propietario que compra en agosto abre su portal
 * y ve "Sin comunicados todavía" aunque el condominio haya avisado del
 * corte de agua la semana pasada (prueba por rol del 2026-08-08).
 *
 * Se devuelven aparte y de SOLO LECTURA a propósito: no se le fabrican
 * destinatarios hacia atrás, porque eso ensuciaría el "entregado a 15 ·
 * leído por 3" que la administración usa como constancia de haber
 * avisado. Aquí la persona solo consulta lo que ya se dijo.
 *
 * Respeta la audiencia: si el comunicado iba dirigido a un rol, solo lo
 * ve quien tenga ese rol en el condominio.
 */
export async function listEarlierCommunications(
  companyId: string,
  personId: string,
  condominiumId: string
) {
  return withTenantContext(companyId, async (tx) => {
    const memberships = await tx.propertyMember.findMany({
      where: { personId, endDate: null, property: { condominiumId } },
      select: { role: true },
    });
    const misRoles = [...new Set(memberships.map((m) => String(m.role)))];

    return tx.communication.findMany({
      where: {
        condominiumId,
        status: 'enviado',
        recipients: { none: { personId } },
        OR: [
          { targets: { some: { targetType: 'todos' } } },
          ...(misRoles.length > 0
            ? [{ targets: { some: { targetType: 'rol' as const, role: { in: misRoles } } } }]
            : []),
        ],
      },
      include: { attachments: { orderBy: { uploadedAt: 'asc' } } },
      orderBy: { sentAt: 'desc' },
      take: 20,
    });
  });
}

export async function publishCommunication(companyId: string, userId: string, userName: string, id: string) {
  return withTenantContext(companyId, async (tx) => {
    const comm = await tx.communication.findFirstOrThrow({
      where: { id },
      include: { targets: true },
    });

    const target = comm.targets[0];
    let members: { personId: string; propertyId: string }[];
    if (target?.targetType === 'todos') {
      members = await tx.propertyMember.findMany({
        where: { endDate: null, property: { condominiumId: comm.condominiumId } },
        distinct: ['personId'],
        include: { property: true },
      });
    } else if (target?.targetType === 'rol' && target.role) {
      members = await tx.propertyMember.findMany({
        where: {
          endDate: null,
          role: target.role as any,
          property: { condominiumId: comm.condominiumId },
        },
        distinct: ['personId'],
        include: { property: true },
      });
    } else {
      members = [];
    }

    await tx.communicationRecipient.createMany({
      data: members.map((m) => ({
        communicationId: comm.id,
        personId: m.personId,
        propertyId: m.propertyId,
        channel: 'push' as const,
      })),
      skipDuplicates: true,
    });

    const updated = await tx.communication.update({
      where: { id },
      data: { status: 'enviado', sentAt: new Date() },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Comunicados', action: 'Comunicado publicado', target: comm.title });
    return updated;
  });
}

export async function addCommunicationAttachment(
  companyId: string,
  communicationId: string,
  input: { fileName: string; fileUrl: string; kind: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.communicationAttachment.create({
      data: { communicationId, fileName: input.fileName, fileUrl: input.fileUrl, kind: input.kind },
    })
  );
}
