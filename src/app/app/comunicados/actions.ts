'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { communicationSchema } from '@/lib/validations/communication';
import { createCommunication, publishCommunication, addCommunicationAttachment } from '@/lib/services/communications';
import { MEDIA_MAX_BYTES, MEDIA_EXT, fileKind } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string };

export async function createCommunicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  if (!can(session, 'comunicados')) return { formError: 'No tienes permiso para esta acción.' };

  const parsed = communicationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  let comm;
  try {
    comm = await createCommunication(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', parsed.data);

    // Adjuntos: documentos, imágenes y videos.
    for (const value of formData.getAll('files')) {
      if (!(value instanceof File) || value.size === 0 || !value.name) continue;
      const url = await saveToRepository(value, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'administracion/comunicados' }, { maxBytes: MEDIA_MAX_BYTES, allowedExt: MEDIA_EXT });
      await addCommunicationAttachment(session.user.companyId, comm.id, {
        fileName: value.name,
        fileUrl: url,
        kind: fileKind(value.name),
      });
    }
  } catch (e: any) {
    if (!comm) return { formError: e?.message ?? 'No se pudo crear el comunicado.' };
    return { formError: `Comunicado creado, pero falló un adjunto: ${e?.message ?? 'error'}` };
  }
  revalidatePath('/app/comunicados');
  redirect(`/app/comunicados/${comm.id}`);
}

export async function publishCommunicationAction(id: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'comunicados')) return;
  await publishCommunication(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', id);
  revalidatePath(`/app/comunicados/${id}`);
  revalidatePath('/app/comunicados');
}
