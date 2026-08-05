'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import { saveBudget } from '@/lib/services/budget';

export async function saveBudgetAction(
  condominiumId: string,
  year: number,
  amounts: { accountId: string; amount: number }[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'contador'].includes(session.user.role)) {
    return { ok: false, error: 'Solo la administración y el contador editan el presupuesto.' };
  }
  if (!(await canAccessCondo(session, condominiumId))) return { ok: false, error: 'Sin acceso a ese condominio.' };

  try {
    await saveBudget(session.user.companyId, condominiumId, year, amounts);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo guardar el presupuesto.' };
  }
  revalidatePath('/app/finanzas/presupuesto');
  return { ok: true };
}
