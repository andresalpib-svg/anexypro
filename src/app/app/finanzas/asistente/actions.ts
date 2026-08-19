'use server';

import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { canAccessCondo } from '@/lib/services/condominiums';
import { ask, type AssistantAnswer } from '@/lib/services/financial-assistant';
import { hitRateLimit } from '@/lib/rate-limit';

export type AskResult = { ok: boolean; error?: string; answer?: AssistantAnswer };

export async function askAction(condominiumId: string, question: string): Promise<AskResult> {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff', 'contador'].includes(session.user.role)) {
    return { ok: false, error: 'Sin permiso.' };
  }
  // Mismo motivo que el resto de Finanzas (hallazgo 8.2): sin esto, un
  // supervisor con Finanzas revocada seguía pudiendo preguntarle al
  // asistente por las cifras del condominio.
  if (!can(session, 'finanzas')) {
    return { ok: false, error: 'Sin acceso a Finanzas.' };
  }
  if (!(await canAccessCondo(session, condominiumId))) {
    return { ok: false, error: 'No tenés acceso a ese condominio.' };
  }
  const q = question.trim();
  if (q.length < 3) return { ok: false, error: 'Escribí una pregunta un poco más larga.' };
  if (q.length > 400) return { ok: false, error: 'La pregunta es demasiado larga.' };

  // Frena el abuso de costo de la API de Anthropic (auditoría de
  // seguridad 2026-08-11, hallazgo #20) — el límite de longitud ya
  // existía, pero nada frenaba repetir la pregunta sin parar.
  const { allowed } = await hitRateLimit(`ia-finanzas:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!allowed) return { ok: false, error: 'Hiciste muchas consultas seguidas — esperá unos minutos.' };

  try {
    const answer = await ask(session.user.companyId, condominiumId, q);
    return { ok: true, answer };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo analizar la pregunta.' };
  }
}
