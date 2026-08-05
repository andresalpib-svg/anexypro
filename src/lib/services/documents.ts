import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

export async function listDocuments(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.document.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    })
  );
}

export async function getDocument(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) =>
    tx.document.findFirst({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } })
  );
}

export async function createDocument(
  companyId: string,
  userId: string,
  userName: string,
  input: {
    condominiumId: string;
    category: string;
    title: string;
    visibility: string;
    expiresOn?: Date;
    fileName: string;
    fileUrl: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const doc = await tx.document.create({
      data: {
        condominiumId: input.condominiumId,
        category: input.category as any,
        title: input.title,
        visibility: input.visibility as any,
        expiresOn: input.expiresOn ?? null,
        createdById: userId,
        versions: {
          create: { version: 1, fileName: input.fileName, fileUrl: input.fileUrl, uploadedById: userId },
        },
      },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Documentos', action: 'Documento agregado', target: doc.title });
    return doc;
  });
}

/** Cada subida agrega una fila — la versión anterior NUNCA se pierde. */
export async function addVersion(
  companyId: string,
  userId: string,
  userName: string,
  input: { documentId: string; fileName: string; fileUrl: string; notes?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const doc = await tx.document.findUniqueOrThrow({ where: { id: input.documentId } });
    const nextVersion = doc.currentVersion + 1;
    await tx.documentVersion.create({
      data: { documentId: input.documentId, version: nextVersion, fileName: input.fileName, fileUrl: input.fileUrl, notes: input.notes || null, uploadedById: userId },
    });
    const updated = await tx.document.update({ where: { id: input.documentId }, data: { currentVersion: nextVersion } });
    await logActivity(tx, companyId, { userId, userName, module: 'Documentos', action: `Nueva versión (v${nextVersion})`, target: doc.title });
    return updated;
  });
}

export async function setDocumentBodyText(companyId: string, userId: string, userName: string, documentId: string, bodyText: string) {
  return withTenantContext(companyId, async (tx) => {
    const doc = await tx.document.update({ where: { id: documentId }, data: { bodyText } });
    await logActivity(tx, companyId, { userId, userName, module: 'Documentos', action: 'Contenido de texto actualizado (fundamento para Árbitro Legal IA)', target: doc.title });
    return doc;
  });
}

/** Archivar, nunca eliminar — preserva el historial completo. */
export async function archiveDocument(companyId: string, documentId: string) {
  return withTenantContext(companyId, (tx) => tx.document.update({ where: { id: documentId }, data: { status: 'archivado' } }));
}
