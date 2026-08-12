'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { allowsCondo } from '@/lib/guard';
import { condoOfDocumentRequest } from '@/lib/services/entity-scope';
import { approveRequest, rejectRequest, saveTemplate } from '@/lib/services/document-requests';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/**
 * La emisión la aprueba la administración o la supervisión — mismo
 * permiso que el módulo de Documentos.
 *
 * NO comprueba el condominio: eso lo hace cada acción, porque cuál
 * es el condominio depende de la entidad (`requestId` o
 * `condominiumId` del formulario) y no de un parámetro fijo.
 */
async function guard() {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) return null;
  if (!can(session, 'documentos')) return null;
  return session;
}

export async function approveRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'No tienes permiso para emitir documentos.' };
  const requestId = String(formData.get('requestId') ?? '');
  const bodyText = String(formData.get('bodyText') ?? '');

  try {
    // El condominio se resuelve DESDE la solicitud, nunca de un campo
    // del formulario: así un supervisor no puede aprobar/emitir el
    // documento de un condominio que no tiene asignado con solo
    // conocer el `requestId` de otra filial.
    const condoId = await condoOfDocumentRequest(session.user.companyId, requestId);
    if (!(await allowsCondo(session, condoId))) {
      return { formError: 'No tienes acceso a ese condominio.' };
    }
    await approveRequest(session.user.companyId, requestId, {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Administración',
    }, bodyText || undefined);
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo emitir el documento.' };
  }
  revalidatePath('/app/emision-documentos');
  revalidatePath('/portal/estado-cuenta');
  return { success: true };
}

export async function rejectRequestAction(requestId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guard();
  if (!session) return { ok: false, error: 'No tienes permiso para esta acción.' };
  if (!reason.trim()) return { ok: false, error: 'Indica el motivo del rechazo.' };
  try {
    const condoId = await condoOfDocumentRequest(session.user.companyId, requestId);
    if (!(await allowsCondo(session, condoId))) {
      return { ok: false, error: 'No tienes acceso a ese condominio.' };
    }
    await rejectRequest(session.user.companyId, requestId, reason.trim(), {
      userId: session.user.id,
      userName: session.user.name ?? 'Administración',
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo rechazar la solicitud.' };
  }
  revalidatePath('/app/emision-documentos');
  revalidatePath('/portal/estado-cuenta');
  return { ok: true };
}

export async function saveTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'No tienes permiso para esta acción.' };
  const condominiumId = String(formData.get('condominiumId') ?? '');
  const docType = String(formData.get('docType') ?? '');
  if (!condominiumId || !docType) return { formError: 'Faltan datos de la plantilla.' };
  // El condominio SÍ viene del formulario acá (no hay otra entidad de
  // la que resolverlo: la plantilla puede no existir todavía), así
  // que hay que comprobarlo contra los condominios asignados.
  if (!(await allowsCondo(session, condominiumId))) {
    return { formError: 'No tienes acceso a ese condominio.' };
  }

  try {
    const logoFile = pickFile(formData, 'logo');
    const logoUrl = logoFile ? await saveToRepository(logoFile, { kind: 'condo', condominiumId, slug: 'multimedia/logos' }) : undefined;

    // Firma escaneada. Va al repositorio privado como cualquier otro
    // archivo: es la rúbrica de quien administra, no un adorno.
    const signatureFile = pickFile(formData, 'signature');
    const signatureUrl = signatureFile
      ? await saveToRepository(signatureFile, { kind: 'condo', condominiumId, slug: 'multimedia/logos' }, { allowedExt: IMAGE_EXT })
      : undefined;
    await saveTemplate(session.user.companyId, condominiumId, docType, {
      logoUrl,
      primaryColor: String(formData.get('primaryColor') ?? '#3B6EF5'),
      headerText: String(formData.get('headerText') ?? ''),
      footerText: String(formData.get('footerText') ?? ''),
      adminName: String(formData.get('adminName') ?? ''),
      adminDetails: String(formData.get('adminDetails') ?? ''),
      bodyTemplate: String(formData.get('bodyTemplate') ?? ''),
      signerName: String(formData.get('signerName') ?? ''),
      signerTitle: String(formData.get('signerTitle') ?? ''),
      signatureUrl,
      requiresCurrentAccount: formData.get('requiresCurrentAccount') === 'on',
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar la plantilla.' };
  }
  revalidatePath('/app/emision-documentos');
  return { success: true };
}
