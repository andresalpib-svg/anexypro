'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { setHiddenModules } from '@/lib/services/module-visibility';

export async function saveHiddenModulesAction(
  companyId: string,
  hidden: string[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return { ok: false, error: 'Sin permiso.' };

  try {
    await setHiddenModules(companyId, hidden);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo guardar la configuración.' };
  }
  revalidatePath('/master/modulos');
  revalidatePath('/app', 'layout');
  return { ok: true };
}
