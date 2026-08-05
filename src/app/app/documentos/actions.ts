'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel } from '@/lib/guard';
import { condoOfDocument } from '@/lib/services/entity-scope';
import { documentSchema, versionSchema, bodyTextSchema } from '@/lib/validations/document';
import { createDocument, addVersion, archiveDocument, setDocumentBodyText } from '@/lib/services/documents';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

/** El condominio se resuelve desde el documento, nunca del formulario. */
async function guardDocument(documentId: string) {
  const pre = await requirePanel({ module: '/app/documentos' });
  if (!pre) return null;
  const condoId = await condoOfDocument(pre.user.companyId, documentId);
  return requirePanel({ module: '/app/documentos', condominiumId: condoId });
}

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = documentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/documentos', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    await createDocument(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', {
      ...parsed.data,
      expiresOn: parsed.data.expiresOn ? new Date(parsed.data.expiresOn) : undefined,
    });
  } catch (e: any) {
    return { formError: 'No se pudo crear el documento.' };
  }
  revalidatePath('/app/documentos');
  return { success: true };
}

export async function addVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = versionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guardDocument(parsed.data.documentId);
  if (!session) return SIN_PERMISO;

  try {
    await addVersion(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', parsed.data);
  } catch (e: any) {
    return { formError: 'No se pudo agregar la versión.' };
  }
  revalidatePath('/app/documentos');
  return { success: true };
}

export async function archiveDocumentAction(documentId: string) {
  const session = await guardDocument(documentId);
  if (!session) return;
  await archiveDocument(session.user.companyId, documentId);
  revalidatePath('/app/documentos');
}

export async function setBodyTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = bodyTextSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guardDocument(parsed.data.documentId);
  if (!session) return SIN_PERMISO;

  try {
    await setDocumentBodyText(session.user.companyId, session.user.id, session.user.name ?? 'Usuario', parsed.data.documentId, parsed.data.bodyText);
  } catch (e: any) {
    return { formError: 'No se pudo guardar el texto.' };
  }
  revalidatePath('/app/documentos');
  return { success: true };
}
