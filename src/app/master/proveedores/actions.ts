'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import {
  createProvider,
  updateProvider,
  toggleProviderVisibility,
  deleteProvider,
} from '@/lib/services/service-providers';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/** El directorio es de plataforma: solo el usuario master lo administra. */
async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

function readForm(formData: FormData) {
  return {
    category: String(formData.get('category') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? ''),
    accessories: String(formData.get('accessories') ?? ''),
    phone: String(formData.get('phone') ?? '').trim(),
    whatsapp: String(formData.get('whatsapp') ?? ''),
    email: String(formData.get('email') ?? ''),
    website: String(formData.get('website') ?? ''),
    visible: formData.get('visible') === 'on',
  };
}

export async function saveProviderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master administra el directorio.' };

  const id = String(formData.get('providerId') ?? '');
  const data = readForm(formData);
  if (!data.name || data.name.length < 2) return { errors: { name: ['Indica el nombre de la empresa.'] } };
  if (!data.phone) return { errors: { phone: ['El número de teléfono es obligatorio.'] } };
  if (!data.category) return { errors: { category: ['Selecciona el tipo de proveedor.'] } };

  try {
    const logoFile = pickFile(formData, 'logo');
    const logoUrl = logoFile ? await saveToRepository(logoFile, { kind: 'company', slug: 'proveedores', name: 'Logos de proveedores' }, { allowedExt: IMAGE_EXT }) : undefined;
    if (id) await updateProvider(id, { ...data, logoUrl });
    else await createProvider({ ...data, logoUrl });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar el proveedor.' };
  }
  revalidatePath('/master/proveedores');
  revalidatePath('/portal/proveedores');
  return { success: true };
}

export async function toggleVisibilityAction(id: string, visible: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await toggleProviderVisibility(id, visible);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo actualizar.' };
  }
  revalidatePath('/master/proveedores');
  revalidatePath('/portal/proveedores');
  return { ok: true };
}

export async function deleteProviderAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deleteProvider(id);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo eliminar el proveedor.' };
  }
  revalidatePath('/master/proveedores');
  revalidatePath('/portal/proveedores');
  return { ok: true };
}
