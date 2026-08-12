'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePanel, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { pickFile, IMAGE_EXT, fileKind } from '@/lib/upload';
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { condoOfProperty, condoOfViolationCase } from '@/lib/services/entity-scope';
import {
  searchProperties,
  getPropertyBriefing,
  previewNextAction,
  issueViolation,
  propertyOwnerPersonId,
  createViolationType,
  updateViolationType,
  deleteViolationType,
  saveViolationSettings,
  closeCase,
  type IssueResult,
} from '@/lib/services/violations';

const MODULO = '/app/incumplimientos';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

// ============================================================
// Paso 1 y 2 — consultas de la pantalla
// ============================================================

export async function searchPropertiesAction(condominiumId: string, query: string) {
  const session = await requirePanel({ module: MODULO, condominiumId });
  if (!session) return [];
  return searchProperties(session.user.companyId, condominiumId, query);
}

export async function briefingAction(propertyId: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return null;
  const condoId = await condoOfProperty(session.user.companyId, propertyId);
  if (!(await allowsCondo(session, condoId))) return null;
  return getPropertyBriefing(session.user.companyId, propertyId);
}

/** Qué corresponde emitir, para avisarlo ANTES de que el usuario confirme. */
export async function previewAction(propertyId: string, violationTypeId: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return null;
  const condoId = await condoOfProperty(session.user.companyId, propertyId);
  if (!(await allowsCondo(session, condoId))) return null;
  try {
    return await previewNextAction(session.user.companyId, propertyId, violationTypeId);
  } catch {
    return null;
  }
}

// ============================================================
// Paso 3 — emitir
// ============================================================

const MAX_EVIDENCIAS = 8;

export type IssueState = {
  formError?: string;
  success?: boolean;
  result?: IssueResult;
};

/**
 * El botón único del paso 3.
 *
 * Sube las evidencias al repositorio privado, emite lo que corresponda
 * según la configuración y devuelve el resultado para mostrarlo. La
 * decisión de si es advertencia o multa NO viene del formulario: la
 * toma el motor con el historial de la filial, así que manipular el
 * cliente no cambia lo que se emite.
 */
export async function issueViolationAction(_prev: IssueState, formData: FormData): Promise<IssueState> {
  const condominiumId = String(formData.get('condominiumId') ?? '');
  const propertyId = String(formData.get('propertyId') ?? '');
  const violationTypeId = String(formData.get('violationTypeId') ?? '');
  const observation = String(formData.get('observation') ?? '').trim();

  if (!condominiumId || !propertyId || !violationTypeId) {
    return { formError: 'Falta la filial o el tipo de incumplimiento.' };
  }

  const session = await requirePanel({ module: MODULO, condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  // La filial tiene que ser de ese condominio: no basta con que el
  // condominio sea accesible.
  const condoReal = await condoOfProperty(session.user.companyId, propertyId);
  if (condoReal !== condominiumId) return { formError: 'La filial no pertenece a ese condominio.' };

  try {
    const archivos = formData.getAll('evidences').filter((f): f is File => f instanceof File && f.size > 0);
    if (archivos.length > MAX_EVIDENCIAS) {
      return { formError: `Máximo ${MAX_EVIDENCIAS} archivos de evidencia por notificación.` };
    }

    // La evidencia vive en la carpeta del módulo, marcada con la persona
    // destinataria: así el propietario puede verla desde su portal sin
    // tener acceso al resto de la carpeta.
    const ownerPersonId = await propertyOwnerPersonId(session.user.companyId, propertyId);

    const evidences = [];
    for (const file of archivos) {
      const ref = await saveToRepository(
        file,
        { kind: 'condo', condominiumId, slug: 'incumplimientos' },
        { maxBytes: 25 * 1024 * 1024, ownerPersonId }
      );
      const fileName = decodeUploadName(file.name);
      const tipo = fileKind(fileName);
      evidences.push({
        fileRef: ref,
        fileName,
        mimeType: file.type || 'application/octet-stream',
        kind: tipo === 'video' ? ('video' as const) : ('imagen' as const),
        sizeBytes: file.size,
      });
    }

    const result = await issueViolation(session, {
      condominiumId,
      propertyId,
      violationTypeId,
      observation: observation || undefined,
      evidences,
    });

    revalidatePath('/app/incumplimientos');
    revalidatePath('/portal/incumplimientos');
    return { success: true, result };
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo emitir la notificación.' };
  }
}

export async function closeCaseAction(caseId: string, motivo: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  if (!motivo.trim()) return { ok: false, error: 'Indica el motivo del cierre.' };
  // A diferencia de `briefingAction`/`previewAction`/`issueViolationAction`
  // (mismo archivo), esta acción no resolvía el condominio real del
  // expediente: un supervisor podía cerrar el caso de un condominio
  // que no tiene asignado con solo conocer el `caseId`.
  try {
    const condoReal = await condoOfViolationCase(session.user.companyId, caseId);
    if (!(await allowsCondo(session, condoReal))) {
      return { ok: false, error: SIN_PERMISO };
    }
  } catch {
    return { ok: false, error: 'El expediente no existe.' };
  }
  try {
    await closeCase(session.user.companyId, caseId, motivo, {
      userId: session.user.id,
      userName: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo cerrar el expediente.' };
  }
  revalidatePath('/app/incumplimientos');
  return { ok: true };
}

// ============================================================
// Configuración del catálogo — solo el administrador principal
// ============================================================

const tipoSchema = z.object({
  condominiumId: z.string().uuid(),
  typeId: z.string().uuid().optional().or(z.literal('')),
  name: z.string().min(2, 'Ponle un nombre al incumplimiento').max(60),
  description: z.string().max(300).optional().or(z.literal('')),
  regulationArticle: z.string().max(160).optional().or(z.literal('')),
  warningsRequired: z.coerce.number().int().min(0).max(10),
  daysBetween: z.coerce.number().int().min(0).max(365),
  fineAmount: z.coerce.number().min(0),
  immediateFine: z.coerce.boolean().optional(),
  warningTemplate: z.string().max(4000).optional().or(z.literal('')),
  secondWarningTemplate: z.string().max(4000).optional().or(z.literal('')),
  fineTemplate: z.string().max(4000).optional().or(z.literal('')),
  icon: z.string().max(40).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export async function saveViolationTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = tipoSchema.safeParse({ ...raw, immediateFine: formData.get('immediateFine') === 'on' });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({
    module: MODULO,
    condominiumId: parsed.data.condominiumId,
    roles: ['admin_owner'],
  });
  if (!session) return { formError: 'Solo el administrador principal configura el catálogo.' };

  const datos = {
    name: parsed.data.name,
    description: parsed.data.description || undefined,
    regulationArticle: parsed.data.regulationArticle || undefined,
    warningsRequired: parsed.data.warningsRequired,
    daysBetween: parsed.data.daysBetween,
    fineAmount: parsed.data.fineAmount,
    immediateFine: Boolean(parsed.data.immediateFine),
    warningTemplate: parsed.data.warningTemplate || undefined,
    secondWarningTemplate: parsed.data.secondWarningTemplate || undefined,
    fineTemplate: parsed.data.fineTemplate || undefined,
    icon: parsed.data.icon || undefined,
    sortOrder: parsed.data.sortOrder ?? 0,
    isActive: formData.get('isActive') !== 'off',
  };

  try {
    if (parsed.data.typeId) {
      await updateViolationType(session.user.companyId, parsed.data.typeId, datos);
    } else {
      await createViolationType(session.user.companyId, parsed.data.condominiumId, datos);
    }
  } catch (e: any) {
    if (e?.code === 'P2002') return { errors: { name: ['Ya existe un incumplimiento con ese nombre.'] } };
    return { formError: e?.message ?? 'No se pudo guardar.' };
  }
  revalidatePath('/app/incumplimientos/configuracion');
  revalidatePath('/app/incumplimientos');
  return { success: true };
}

export async function toggleViolationTypeAction(typeId: string, isActive: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO, roles: ['admin_owner'] });
  if (!session) return { ok: false, error: SIN_PERMISO };
  try {
    const { withTenantContext } = await import('@/lib/db');
    await withTenantContext(session.user.companyId, async (tx) => {
      const t = await tx.violationType.findFirst({
        where: { id: typeId, condominium: { companyId: session.user.companyId } },
        select: { id: true },
      });
      if (!t) throw new Error('El tipo no existe.');
      await tx.violationType.update({ where: { id: typeId }, data: { isActive } });
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo actualizar.' };
  }
  revalidatePath('/app/incumplimientos/configuracion');
  return { ok: true };
}

export async function deleteViolationTypeAction(typeId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO, roles: ['admin_owner'] });
  if (!session) return { ok: false, error: SIN_PERMISO };
  try {
    await deleteViolationType(session.user.companyId, typeId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar.' };
  }
  revalidatePath('/app/incumplimientos/configuracion');
  return { ok: true };
}

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const condominiumId = String(formData.get('condominiumId') ?? '');
  if (!condominiumId) return { formError: 'Selecciona un condominio.' };

  const session = await requirePanel({ module: MODULO, condominiumId, roles: ['admin_owner'] });
  if (!session) return { formError: 'Solo el administrador principal configura el documento.' };

  try {
    const logo = pickFile(formData, 'logo');
    const logoUrl = logo
      ? await saveToRepository(logo, { kind: 'condo', condominiumId, slug: 'multimedia/logos' }, { allowedExt: IMAGE_EXT })
      : undefined;

    await saveViolationSettings(session.user.companyId, condominiumId, {
      logoUrl,
      primaryColor: String(formData.get('primaryColor') ?? ''),
      headerText: String(formData.get('headerText') ?? ''),
      footerText: String(formData.get('footerText') ?? ''),
      adminName: String(formData.get('adminName') ?? ''),
      adminDetails: String(formData.get('adminDetails') ?? ''),
      signerName: String(formData.get('signerName') ?? ''),
      signerTitle: String(formData.get('signerTitle') ?? ''),
      responseDays: Number(formData.get('responseDays') ?? 8),
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar la configuración.' };
  }
  revalidatePath('/app/incumplimientos/configuracion');
  return { success: true };
}
