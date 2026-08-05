'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma, withTenantContext } from '@/lib/db';
import { getResidentContext } from '@/lib/services/resident-context';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type PhotoState = { formError?: string; success?: boolean };

/** Fotografía del residente (se guarda en su ficha de persona). */
export async function updateResidentPhotoAction(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { formError: 'Tu cuenta no está vinculada a ninguna unidad.' };

  const file = pickFile(formData, 'photo');
  if (!file) return { formError: 'Selecciona una imagen.' };
  try {
    const photoUrl = await saveToRepository(file, { kind: 'company', slug: 'perfiles', name: 'Fotos de perfil' }, { allowedExt: IMAGE_EXT });
    await withTenantContext(session.user.companyId, (tx) =>
      tx.person.update({ where: { id: ctx.person.id }, data: { photoUrl } })
    );
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar la fotografía.' };
  }
  revalidatePath('/portal/perfil');
  return { success: true };
}

/** Fotografía del usuario administrativo. */
export async function updateAdminPhotoAction(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };

  const file = pickFile(formData, 'photo');
  if (!file) return { formError: 'Selecciona una imagen.' };
  try {
    const photoUrl = await saveToRepository(file, { kind: 'company', slug: 'perfiles', name: 'Fotos de perfil' }, { allowedExt: IMAGE_EXT });
    await prisma.user.update({ where: { id: session.user.id }, data: { photoUrl } });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar la fotografía.' };
  }
  revalidatePath('/app/perfil');
  return { success: true };
}
