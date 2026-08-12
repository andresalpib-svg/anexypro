'use server';

import { requirePanel, SIN_PERMISO } from '@/lib/guard';
import { askAdministrativeAssistant } from '@/lib/services/admin-assistant';
import { hitRateLimit } from '@/lib/rate-limit';

export type AdminAssistantState = { answer?: string; error?: string };

export async function askAdminAssistantAction(_prev: AdminAssistantState, formData: FormData): Promise<AdminAssistantState> {
  const condominiumId = formData.get('condominiumId') as string;
  const question = (formData.get('question') as string)?.trim();
  if (!question) return { error: 'Escribe tu pregunta.' };
  // Sin tope, una pregunta larguísima infla el costo de la llamada a la
  // API de Anthropic (auditoría de seguridad 2026-08-11, hallazgo #20).
  if (question.length > 800) return { error: 'Tu pregunta es demasiado larga — resumila un poco.' };

  // El asistente lee información del condominio para responder: pedir
  // uno ajeno no puede ser una vía para conocerlo.
  const session = await requirePanel({ module: '/app/asistentes-ia', condominiumId });
  if (!session) return { error: SIN_PERMISO };

  const { allowed } = await hitRateLimit(`ia-admin:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!allowed) return { error: 'Hiciste muchas consultas seguidas — esperá unos minutos.' };

  const answer = await askAdministrativeAssistant(session.user.companyId, condominiumId, question);
  return { answer };
}
