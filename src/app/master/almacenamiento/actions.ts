'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { buildProvider, setStorageSettings, getStorageSettings, IMPLEMENTED } from '@/lib/storage';
import type { StorageKind } from '@/lib/storage/provider';
import { mensajeDeError } from '@/lib/errores';

async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

/** Prueba el proveedor SIN activarlo. */
export async function testProviderAction(
  kind: StorageKind
): Promise<{ ok: boolean; detail: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, detail: 'Sin permiso.' };
  try {
    const settings = await getStorageSettings();
    const provider = buildProvider(kind, settings.config);
    return await provider.healthCheck();
  } catch (e: any) {
    return { ok: false, detail: mensajeDeError(e, 'No se pudo construir el proveedor.') };
  }
}

/**
 * Cambia el proveedor activo.
 *
 * Se PRUEBA antes de guardar: dejar activo un proveedor que no responde
 * rompería la subida de documentos en toda la plataforma.
 */
export async function activateProviderAction(
  kind: StorageKind
): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  if (!IMPLEMENTED.includes(kind)) {
    return { ok: false, error: 'Ese proveedor todavía no tiene implementación. La arquitectura ya lo contempla.' };
  }

  const health = await testProviderAction(kind);
  if (!health.ok) {
    return { ok: false, error: `No se activó: ${health.detail}` };
  }

  await setStorageSettings({ provider: kind, userId: session.user.id });
  revalidatePath('/master/almacenamiento');
  revalidatePath('/app/repositorio');
  return { ok: true, detail: health.detail };
}
