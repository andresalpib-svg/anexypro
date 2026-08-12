'use server';

import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getPropertySuspension } from '@/lib/services/finance';
import { askLegalArbiter, type LegalAnswer } from '@/lib/services/legal-assistant';
import { hitRateLimit } from '@/lib/rate-limit';

export type LegalState = { answer?: LegalAnswer; error?: string };

export async function askLegalAction(_prev: LegalState, formData: FormData): Promise<LegalState> {
  const session = await auth();
  if (!session?.user) return { error: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { error: 'Tu cuenta no está vinculada a ninguna unidad.' };

  const suspension = await getPropertySuspension(session.user.companyId, ctx.property.id);
  if (suspension.suspended) return { error: 'Bloqueado por suspensión de servicios.' };

  const question = (formData.get('question') as string)?.trim();
  if (!question) return { error: 'Escribe tu consulta.' };
  // Sin tope, una pregunta larguísima infla el costo de la llamada a la
  // API de Anthropic (auditoría de seguridad 2026-08-11, hallazgo #20).
  if (question.length > 800) return { error: 'Tu consulta es demasiado larga — resumila un poco.' };

  const { allowed } = await hitRateLimit(`ia-legal:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!allowed) return { error: 'Hiciste muchas consultas seguidas — esperá unos minutos.' };

  const answer = await askLegalArbiter(session.user.companyId, ctx.condominium.id, question);
  return { answer };
}
