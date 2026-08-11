'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import {
  assetSchema,
  updateAssetSchema,
  assetCategorySchema,
  providerSchema,
  updateProviderSchema,
  ticketSchema,
  completeTicketSchema,
} from '@/lib/validations/maintenance';
import {
  createAsset,
  updateAsset,
  deleteAsset,
  createAssetCategory,
  renameAssetCategory,
  toggleAssetCategory,
  deleteAssetCategory,
  createProvider,
  updateProvider,
  deleteProvider,
  createTicket,
  updateTicketStatus,
  completeTicket,
} from '@/lib/services/maintenance';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import { condoOfAsset, condoOfAssetCategory, condoOfProvider, condoOfTicket } from '@/lib/services/entity-scope';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/**
 * Tener el área de Mantenimientos habilitada no alcanza: hay que
 * tenerla sobre ESE condominio. El supervisor solo administra los que
 * la administración le asignó.
 */
const MODULO = '/app/mantenimiento';

export async function createAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  try {
    const photoFile = pickFile(formData, 'photo');
    const photoUrl = photoFile
      ? await saveToRepository(
          photoFile,
          { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'multimedia/fotografias' },
          { allowedExt: IMAGE_EXT }
        )
      : undefined;
    await createAsset(session.user.companyId, { ...parsed.data, photoUrl });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear el activo.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function updateAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateAssetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO });
  if (!session) return { formError: SIN_PERMISO };
  const { assetId, ...data } = parsed.data;
  // Al actualizar no viene el condominio: se toma del activo mismo.
  const condoId = await condoOfAsset(session.user.companyId, assetId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  try {
    const photoFile = pickFile(formData, 'photo');
    const photoUrl = photoFile
      ? await saveToRepository(
          photoFile,
          { kind: 'condo', condominiumId: condoId, slug: 'multimedia/fotografias' },
          { allowedExt: IMAGE_EXT }
        )
      : undefined;
    await updateAsset(session.user.companyId, assetId, { ...data, photoUrl });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo actualizar el activo.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function deleteAssetAction(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfAsset(session.user.companyId, assetId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await deleteAsset(session.user.companyId, assetId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar el activo.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

// ============================================================
// Categorías de activos — "Editar más opciones" del selector
// ============================================================

export async function saveAssetCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = assetCategorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  try {
    if (parsed.data.categoryId) {
      await renameAssetCategory(session.user.companyId, parsed.data.categoryId, parsed.data.name);
    } else {
      await createAssetCategory(session.user.companyId, parsed.data.condominiumId, parsed.data.name);
    }
  } catch (e: any) {
    if (e?.code === 'P2002') return { errors: { name: ['Ya existe una categoría con ese nombre.'] } };
    return { formError: e?.message ?? 'No se pudo guardar la categoría.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function toggleAssetCategoryAction(categoryId: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  try {
    const condoId = await condoOfAssetCategory(session.user.companyId, categoryId);
    if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };
    await toggleAssetCategory(session.user.companyId, categoryId, isActive);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo actualizar la categoría.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

export async function deleteAssetCategoryAction(categoryId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  try {
    const condoId = await condoOfAssetCategory(session.user.companyId, categoryId);
    if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };
    await deleteAssetCategory(session.user.companyId, categoryId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar la categoría.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

export async function createProviderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = providerSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  await createProvider(session.user.companyId, parsed.data);
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function updateProviderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateProviderSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO });
  if (!session) return { formError: SIN_PERMISO };
  const { providerId, ...data } = parsed.data;
  const condoId = await condoOfProvider(session.user.companyId, providerId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  try {
    await updateProvider(session.user.companyId, providerId, data);
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo actualizar el proveedor.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function deleteProviderAction(providerId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfProvider(session.user.companyId, providerId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await deleteProvider(session.user.companyId, providerId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar el proveedor.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

export async function createTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ticketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  await createTicket(session.user.companyId, session.user.id, {
    ...parsed.data,
    assetId: parsed.data.assetId || undefined,
    providerId: parsed.data.providerId || undefined,
  });
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function setTicketStatusAction(ticketId: string, status: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return;
  const condoId = await condoOfTicket(session.user.companyId, ticketId);
  if (!(await allowsCondo(session, condoId))) return;

  await updateTicketStatus(session.user.companyId, ticketId, status);
  revalidatePath('/app/mantenimiento');
}

export async function completeTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = completeTicketSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO });
  if (!session) return { formError: SIN_PERMISO };
  const condoId = await condoOfTicket(session.user.companyId, parsed.data.ticketId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  await completeTicket(
    session.user.companyId,
    parsed.data.ticketId,
    session.user.id,
    session.user.name ?? session.user.email ?? 'Usuario',
    parsed.data.cost
  );
  revalidatePath('/app/mantenimiento');
  return { success: true };
}
