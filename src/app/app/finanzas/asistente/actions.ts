'use server';

import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import { ask, type AssistantAnswer } from '@/lib/services/financial-assistant';

export type AskResult = { ok: boolean; error?: string; answer?: AssistantAnswer };

export async function askAction(condominiumId: string, question: string): Promise<AskResult> {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff', 'contador'].includes(session.user.role)) {
    return { ok: false, error: 'Sin permiso.' };
  }
  if (!(await canAccessCondo(session, condominiumId))) {
    return { ok: false, error: 'No tenés acceso a ese condominio.' };
  }
  const q = question.trim();
  if (q.length < 3) return { ok: false, error: 'Escribí una pregunta un poco más larga.' };
  if (q.length > 400) return { ok: false, error: 'La pregunta es demasiado larga.' };

  try {
    const answer = await ask(session.user.companyId, condominiumId, q);
    return { ok: true, answer };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo analizar la pregunta.' };
  }
}
