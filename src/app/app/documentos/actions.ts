'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { documentSchema, versionSchema, bodyTextSchema } from '@/lib/validations/document';
import { createDocument, addVersion, archiveDocument, setDocumentBodyText } from '@/lib/services/documents';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function guard(session: any) {
  if (!session?.user) return 'Sesión expirada.';
  if (!can(session, 'documentos')) return 'No tienes permiso para esta acción.';
  return null;
}

export async function createDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = documentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await createDocument(session!.user.companyId, session!.user.id, session!.user.name ?? session!.user.email ?? 'Usuario', {
    ...parsed.data,
    expiresOn: parsed.data.expiresOn ? new Date(parsed.data.expiresOn) : undefined,
  });
  revalidatePath('/app/documentos');
  return { success: true };
}

export async function addVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = versionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await addVersion(session!.user.companyId, session!.user.id, session!.user.name ?? session!.user.email ?? 'Usuario', parsed.data);
  revalidatePath('/app/documentos');
  return { success: true };
}

export async function archiveDocumentAction(documentId: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'documentos')) return;
  await archiveDocument(session.user.companyId, documentId);
  revalidatePath('/app/documentos');
}

export async function setBodyTextAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = bodyTextSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await setDocumentBodyText(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', parsed.data.documentId, parsed.data.bodyText);
  revalidatePath('/app/documentos');
  return { success: true };
}
