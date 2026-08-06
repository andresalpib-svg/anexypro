'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext, ACTIVE_UNIT_COOKIE } from '@/lib/services/resident-context';

/**
 * Cambia la unidad desde la que el residente está mirando el portal.
 *
 * Se comprueba que la unidad sea SUYA antes de guardarla: la cookie la
 * escribe el servidor, pero el id llega del navegador. Sin esta
 * comprobación, cambiar un valor en el formulario bastaría para mirar
 * el estado de cuenta de otra filial.
 */
export async function setActiveUnitAction(propertyId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'condomino') return { ok: false, error: 'Sesión expirada.' };

  const ctx = await getResidentContext(session.user.id);
  if (!ctx?.units.some((u) => u.propertyId === propertyId)) {
    return { ok: false, error: 'Esa unidad no está a tu nombre.' };
  }

  cookies().set(ACTIVE_UNIT_COOKIE, propertyId, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/portal', 'layout');
  return { ok: true };
}
