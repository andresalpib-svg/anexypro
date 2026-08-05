'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import { closePeriod, reopenPeriod } from '@/lib/services/accounting-periods';

export async function closePeriodAction(
  condominiumId: string,
  period: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  // Cerrar un mes congela los estados financieros: es una decisión de
  // la administración propietaria, no del supervisor ni del contador.
  if (!session?.user || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo la administración propietaria cierra el mes.' };
  }
  if (!(await canAccessCondo(session, condominiumId))) return { ok: false, error: 'Sin acceso.' };

  try {
    await closePeriod(session.user.companyId, condominiumId, period, session.user.id);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo cerrar el período.' };
  }
  revalidatePath('/app/finanzas/cierre');
  return { ok: true };
}

export async function reopenPeriodAction(
  condominiumId: string,
  period: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo la administración propietaria reabre un mes.' };
  }
  if (!(await canAccessCondo(session, condominiumId))) return { ok: false, error: 'Sin acceso.' };

  try {
    await reopenPeriod(session.user.companyId, condominiumId, period, reason);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo reabrir el período.' };
  }
  revalidatePath('/app/finanzas/cierre');
  return { ok: true };
}
