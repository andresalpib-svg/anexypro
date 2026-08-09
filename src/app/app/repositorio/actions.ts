'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import {
  actorFromSession,
  uploadToFolder,
  deleteObject,
  renameObject,
  ensureCondoTree,
  searchObjects,
} from '@/lib/services/storage';
import { issueLink, linkPath } from '@/lib/services/storage-links';
import { decodeUploadName } from '@/lib/services/file-refs';
import { guessMime } from '@/lib/storage/local-provider';
import { pickFile, MEDIA_EXT, MEDIA_MAX_BYTES } from '@/lib/upload';
import { mensajeDeError } from '@/lib/errores';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user) return null;
  // El repositorio del panel es para el personal; el residente ve sus
  // documentos en su propio portal.
  if (!['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad'].includes(session.user.role)) return null;
  if (session.user.role !== 'master' && !(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const condominiumId = String(formData.get('condominiumId') ?? '');
  const folderId = String(formData.get('folderId') ?? '');
  if (!condominiumId || !folderId) return { formError: 'Falta la carpeta de destino.' };

  const session = await guard(condominiumId);
  if (!session) return { formError: 'Sin permiso sobre este condominio.' };

  const file = pickFile(formData, 'file');
  if (!file) return { errors: { file: ['Elegí un archivo.'] } };

  // Misma lista blanca que el resto de subidas del sistema: sin ella se
  // podía subir .html/.svg, que servidos en el origen son XSS almacenado.
  const fileName = decodeUploadName(file.name);
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!MEDIA_EXT.has(ext)) {
    return { errors: { file: [`Tipo de archivo no permitido (.${ext}). Usá: ${[...MEDIA_EXT].join(', ')}.`] } };
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return { errors: { file: ['El archivo supera el máximo de 100 MB.'] } };
  }

  try {
    const actor = await actorFromSession(session);
    await uploadToFolder(actor, {
      folderId,
      fileName,
      mimeType: guessMime(fileName),
      data: Buffer.from(await file.arrayBuffer()),
      userId: session.user.id,
      userName: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { formError: mensajeDeError(e, 'No se pudo subir el documento.') };
  }
  revalidatePath('/app/repositorio');
  return { success: true };
}

/**
 * Emite el enlace de descarga. Vive 5 minutos, es para este usuario y
 * apunta a ANEXYpro — nunca al proveedor.
 */
export async function linkForAction(
  objectId: string,
  condominiumId: string,
  mode: 'v' | 'd'
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  return { ok: true, url: linkPath(issueLink(objectId, session.user.id, { mode })) };
}

export async function deleteDocumentAction(
  objectId: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deleteObject(await actorFromSession(session), objectId);
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo eliminar.') };
  }
  revalidatePath('/app/repositorio');
  return { ok: true };
}

export async function renameDocumentAction(
  objectId: string,
  condominiumId: string,
  newName: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await renameObject(await actorFromSession(session), objectId, newName);
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo renombrar.') };
  }
  revalidatePath('/app/repositorio');
  return { ok: true };
}

/** Reconstruye el árbol si quedó incompleto. Es idempotente. */
export async function rebuildTreeAction(condominiumId: string): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const session = await guard(condominiumId);
  if (!session || !['master', 'admin_owner'].includes(session.user.role)) {
    return { ok: false, error: 'Solo la administración reconstruye el repositorio.' };
  }
  try {
    const r = await ensureCondoTree(session.user.companyId, condominiumId);
    revalidatePath('/app/repositorio');
    return { ok: true, detail: `${r.created} carpeta(s) creada(s), ${r.existing} ya existían.` };
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo reconstruir el repositorio.') };
  }
}

export async function searchAction(
  condominiumId: string,
  query: string
): Promise<{ ok: boolean; results?: { id: string; name: string; folderName: string; sizeBytes: number }[]; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  if (query.trim().length < 2) return { ok: true, results: [] };
  try {
    const rows = await searchObjects(await actorFromSession(session), condominiumId, query.trim());
    return {
      ok: true,
      results: rows.map((r) => ({ id: r.id, name: r.name, folderName: r.folderName, sizeBytes: r.sizeBytes })),
    };
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo buscar.') };
  }
}
