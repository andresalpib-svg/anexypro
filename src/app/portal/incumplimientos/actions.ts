'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { markNoticeRead } from '@/lib/services/violations';

/**
 * Acuse de lectura.
 *
 * La filial sale de la sesión del residente, no del cliente: nadie
 * puede confirmar la lectura de una notificación de otra unidad. El
 * servicio además comprueba que la notificación pertenezca a esa filial
 * y conserva la primera fecha, que es la que vale como constancia.
 */
export async function confirmReadAction(actionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Sesión expirada.' };

  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { ok: false, error: 'Tu cuenta no está vinculada a ninguna unidad.' };

  try {
    await markNoticeRead(session.user.companyId, actionId, ctx.property.id, session.user.id);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo confirmar la lectura.' };
  }

  revalidatePath('/portal/incumplimientos');
  revalidatePath('/portal/dashboard');
  return { ok: true };
}
