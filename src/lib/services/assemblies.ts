import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

/**
 * INTEGRIDAD DEL VOTO — decisión de producto explícita, igual que en
 * el prototipo (ver diseno-modulo-16-asambleas.md "Historial de
 * cambios v1.1" en el repositorio del prototipo): la administración
 * puede abrir/cerrar una votación y observar resultados en tiempo
 * real, pero NUNCA puede emitir ni modificar un voto — ni a favor de
 * un residente que se lo pida por teléfono, ni bajo ninguna otra
 * circunstancia. Por eso este archivo NO tiene una función
 * `castBallot` ni nada equivalente — esa función solo existirá en la
 * capa del Ecosistema Condómino (portal separado, todavía pendiente),
 * siempre atada a la sesión del residente autenticado votando por su
 * propia unidad.
 */

export async function listAssemblies(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.assembly.findMany({ where: { condominiumId }, orderBy: { eventDate: 'desc' } })
  );
}

export async function getAssembly(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) =>
    tx.assembly.findFirst({
      where: { id },
      include: {
        topics: {
          orderBy: { sortOrder: 'asc' },
          include: { vote: { include: { ballots: true } } },
        },
        attendance: true,
      },
    })
  );
}

export async function createAssembly(
  companyId: string,
  userId: string,
  userName: string,
  input: {
    condominiumId: string;
    type: string;
    title: string;
    eventDate: Date;
    eventTime: string;
    location?: string;
    convocatoriaBody: string;
    topics: string[];
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const assembly = await tx.assembly.create({
      data: {
        condominiumId: input.condominiumId,
        type: input.type as any,
        title: input.title,
        eventDate: input.eventDate,
        eventTime: input.eventTime,
        location: input.location || null,
        convocatoriaBody: input.convocatoriaBody,
        createdById: userId,
        topics: {
          create: input.topics.map((title, i) => ({ title, sortOrder: i, requiresVote: true })),
        },
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Asambleas', action: 'Convocatoria creada', target: assembly.title });
    return assembly;
  });
}

export async function openVote(companyId: string, topicId: string, userId: string, userName: string) {
  return withTenantContext(companyId, async (tx) => {
    const vote = await tx.assemblyVote.upsert({
      where: { topicId },
      create: { topicId, status: 'abierta' },
      update: { status: 'abierta' },
    });
    const topic = await tx.assemblyTopic.findUniqueOrThrow({ where: { id: topicId } });
    await logActivity(tx, companyId, { userId, userName, module: 'Asambleas', action: 'Votación abierta', target: topic.title });
    return vote;
  });
}

export async function closeVote(companyId: string, topicId: string, userId: string, userName: string) {
  return withTenantContext(companyId, async (tx) => {
    const vote = await tx.assemblyVote.findUnique({ where: { topicId } });
    if (!vote) throw new Error('Esta votación no se ha abierto todavía.');
    const updated = await tx.assemblyVote.update({ where: { topicId }, data: { status: 'cerrada', closedAt: new Date() } });
    const topic = await tx.assemblyTopic.findUniqueOrThrow({ where: { id: topicId } });
    await logActivity(tx, companyId, { userId, userName, module: 'Asambleas', action: 'Votación cerrada', target: topic.title });
    return updated;
  });
}

/**
 * castBallot — la ÚNICA función de votar en toda la aplicación. Vive
 * aquí, en el servicio compartido, pero SOLO se llama desde
 * src/app/portal/asambleas/actions.ts (Ecosistema Condómino), nunca
 * desde src/app/app/asambleas/actions.ts (Administradora) — esa
 * ausencia es deliberada, ver el comentario al final de ese archivo.
 * propertyId SIEMPRE viene de resolver la sesión autenticada del
 * residente (getResidentContext), nunca de un parámetro que el
 * cliente pueda manipular para votar por una unidad ajena. Un voto
 * por unidad por votación, sin excepción — reforzado además por la
 * restricción única de la base de datos (@@unique([voteId,
 * propertyId]) en AssemblyBallot).
 */
export async function castBallot(
  companyId: string,
  input: { voteId: string; propertyId: string; voterName: string; choice: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const vote = await tx.assemblyVote.findUniqueOrThrow({
      where: { id: input.voteId },
      include: { topic: { select: { assembly: { select: { condominiumId: true } } } } },
    });
    if (vote.status !== 'abierta') throw new Error('Esta votación no está abierta.');

    // `voteId` nunca se cruzaba contra el condominio del residente: sin
    // esto, un residente de un condominio podía votar en la asamblea de
    // OTRO condominio de la misma empresa con solo conocer el `voteId`
    // (auditoría de seguridad 2026-08-11, hallazgo #14). `propertyId` sí
    // viene siempre de la sesión resuelta del residente, nunca del
    // formulario — acá se le da valor comparándolo contra el
    // condominio real de la votación.
    const property = await tx.property.findFirstOrThrow({
      where: { id: input.propertyId },
      select: { condominiumId: true },
    });
    if (vote.topic.assembly.condominiumId !== property.condominiumId) {
      throw new Error('Esa votación no corresponde a tu condominio.');
    }

    return tx.assemblyBallot.create({
      data: { voteId: input.voteId, propertyId: input.propertyId, voterName: input.voterName, choice: input.choice as any },
    });
  });
}
export async function publishMinutes(companyId: string, userId: string, userName: string, assemblyId: string, minutesBody: string) {
  return withTenantContext(companyId, async (tx) => {
    const assembly = await tx.assembly.update({
      where: { id: assemblyId },
      data: {
        minutesBody,
        minutesPublished: true,
        minutesPublishedAt: new Date(),
        minutesApprovedById: userId,
        status: 'cerrada',
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Asambleas', action: 'Acta publicada', target: assembly.title });
    return assembly;
  });
}
