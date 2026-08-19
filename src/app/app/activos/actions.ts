'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePanel } from '@/lib/guard';
import { createAsset, updateAsset, deleteAsset } from '@/lib/services/maintenance';
import { runAssetDepreciation, runAssetDepreciationForCondo, disposeAsset } from '@/lib/services/asset-depreciation';
import { condoOfAsset } from '@/lib/services/entity-scope';
import { pickFile } from '@/lib/upload';
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { isSafePng, isSafeJpeg, MAX_IMAGE_BYTES } from '@/lib/image-safety';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/** @db.Date: mediodía para que no se corra de día por zona horaria. */
const asDate = (s: string) => new Date(`${s}T12:00:00`);
const asDateOpt = (s: string) => (s ? asDate(s) : null);

/**
 * Delega en `requirePanel` en vez de reimplementarlo.
 *
 * Este archivo tenía su propio guard con la lista de roles y el
 * `canAccessCondo`, pero le faltaban dos cosas que `requirePanel` sí
 * hace: consultar la grilla de permisos (`can`) y cerrar el paso a una
 * empresa demo vencida. Revocarle Mantenimientos a un supervisor en
 * Configuración le quitaba el módulo del menú y le cerraba la
 * pantalla, pero no le cerraba estas acciones — y una Server Action es
 * un endpoint HTTP que se llama sin pasar por la pantalla (hallazgo
 * 8.2). Dos implementaciones del mismo permiso siempre terminan
 * separándose; ahora hay una sola.
 */
async function guard(condominiumId: string) {
  return requirePanel({ area: 'mantenimientos', roles: ['admin_owner', 'admin_staff'], condominiumId });
}

const assetSchema = z.object({
  condominiumId: z.string().uuid(),
  code: z.string().max(40).optional().or(z.literal('')),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
  location: z.string().max(100).optional().or(z.literal('')),
  purchaseDate: z.string().optional().or(z.literal('')),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  acquisitionValue: z.coerce.number().min(0).optional(),
  residualValue: z.coerce.number().min(0).optional(),
  usefulLifeMonths: z.coerce.number().int().positive().optional(),
  depreciationMethod: z.enum(['lineal']).optional().or(z.literal('')),
  depreciationStartDate: z.string().optional().or(z.literal('')),
});

export async function createAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = assetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    const photoFile = pickFile(formData, 'photo');
    let photoUrl: string | undefined;
    if (photoFile) {
      if (photoFile.size > MAX_IMAGE_BYTES) return { errors: { photo: ['La imagen pesa demasiado (máximo 12 MB).'] } };
      const ext = photoFile.name.toLowerCase().slice(photoFile.name.lastIndexOf('.'));
      if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        const buf = Buffer.from(await photoFile.arrayBuffer());
        const ok = ext === '.png' ? isSafePng(buf) : isSafeJpeg(buf);
        if (!ok) return { errors: { photo: ['No se pudo leer esa imagen — está dañada.'] } };
      }
      photoUrl = await saveToRepository(photoFile, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'activos' });
    }

    await createAsset(session.user.companyId, {
      condominiumId: parsed.data.condominiumId,
      code: parsed.data.code || undefined,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || undefined,
      description: parsed.data.description || undefined,
      location: parsed.data.location || undefined,
      purchaseDate: asDateOpt(parsed.data.purchaseDate ?? ''),
      supplierId: parsed.data.supplierId || undefined,
      acquisitionValue: parsed.data.acquisitionValue,
      residualValue: parsed.data.residualValue,
      usefulLifeMonths: parsed.data.usefulLifeMonths,
      depreciationMethod: parsed.data.depreciationMethod || undefined,
      depreciationStartDate: asDateOpt(parsed.data.depreciationStartDate ?? ''),
      photoUrl,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear el activo.' };
  }
  revalidatePath('/app/activos');
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

const updateAssetSchema = assetSchema.omit({ condominiumId: true }).extend({ assetId: z.string().uuid() });

export async function updateAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateAssetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // El condominio se toma del activo, nunca del formulario; con él en
  // la mano, el guard vuelve a preguntar por rol, permiso y acceso.
  const pre = await requirePanel({ area: 'mantenimientos', roles: ['admin_owner', 'admin_staff'] });
  if (!pre) return { formError: 'Sin permiso.' };
  const condoId = await condoOfAsset(pre.user.companyId, parsed.data.assetId);
  const session = await guard(condoId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    const photoFile = pickFile(formData, 'photo');
    let photoUrl: string | undefined;
    if (photoFile && photoFile.size > 0) {
      if (photoFile.size > MAX_IMAGE_BYTES) return { errors: { photo: ['La imagen pesa demasiado (máximo 12 MB).'] } };
      photoUrl = await saveToRepository(photoFile, { kind: 'condo', condominiumId: condoId, slug: 'activos' });
    }

    await updateAsset(session.user.companyId, parsed.data.assetId, {
      code: parsed.data.code || undefined,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || undefined,
      description: parsed.data.description || undefined,
      location: parsed.data.location || undefined,
      purchaseDate: asDateOpt(parsed.data.purchaseDate ?? ''),
      supplierId: parsed.data.supplierId || undefined,
      acquisitionValue: parsed.data.acquisitionValue,
      residualValue: parsed.data.residualValue,
      usefulLifeMonths: parsed.data.usefulLifeMonths,
      depreciationMethod: parsed.data.depreciationMethod || undefined,
      depreciationStartDate: asDateOpt(parsed.data.depreciationStartDate ?? ''),
      photoUrl,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo actualizar el activo.' };
  }
  revalidatePath('/app/activos');
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

export async function deleteAssetAction(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const pre = await requirePanel({ area: 'mantenimientos', roles: ['admin_owner', 'admin_staff'] });
  if (!pre) return { ok: false, error: 'Sin permiso.' };
  const condoId = await condoOfAsset(pre.user.companyId, assetId);
  const session = await guard(condoId);
  if (!session) return { ok: false, error: 'No tenés acceso a este condominio.' };

  try {
    await deleteAsset(session.user.companyId, assetId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar el activo.' };
  }
  revalidatePath('/app/activos');
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

export async function runDepreciationAction(assetId: string, condominiumId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await runAssetDepreciation(session.user.companyId, { id: session.user.id, name: session.user.name ?? 'Usuario' }, { assetId });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo registrar la depreciación.' };
  }
  revalidatePath('/app/activos');
  return { ok: true };
}

export async function runCondoDepreciationAction(condominiumId: string): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    const { periodOf } = await import('@/lib/services/accounting-periods');
    const r = await runAssetDepreciationForCondo(session.user.companyId, condominiumId, periodOf(new Date()), {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
    revalidatePath('/app/activos');
    return { ok: true, summary: `${r.created} activo(s) depreciado(s), ${r.skipped} sin novedad.` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo correr la depreciación.' };
  }
}

const disposeSchema = z.object({
  condominiumId: z.string().uuid(),
  assetId: z.string().uuid(),
  date: z.string().min(10, 'Indicá la fecha'),
  reason: z.string().min(5, 'Indicá el motivo de la baja').max(300),
});

export async function disposeAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = disposeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    const docFile = pickFile(formData, 'document');
    let documentUrl: string | undefined;
    let documentName: string | undefined;
    if (docFile) {
      if (docFile.size > MAX_IMAGE_BYTES) return { errors: { document: ['El documento pesa demasiado (máximo 12 MB).'] } };
      documentUrl = await saveToRepository(docFile, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'activos/bajas' });
      documentName = decodeUploadName(docFile.name);
    }

    await disposeAsset(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      { assetId: parsed.data.assetId, date: asDate(parsed.data.date), reason: parsed.data.reason, documentUrl, documentName }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar la baja.' };
  }
  revalidatePath('/app/activos');
  revalidatePath('/app/mantenimiento');
  return { success: true };
}
