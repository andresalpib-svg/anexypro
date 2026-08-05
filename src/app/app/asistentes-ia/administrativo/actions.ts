'use server';

import { requirePanel, SIN_PERMISO } from '@/lib/guard';
import { askAdministrativeAssistant } from '@/lib/services/admin-assistant';

export type AdminAssistantState = { answer?: string; error?: string };

export async function askAdminAssistantAction(_prev: AdminAssistantState, formData: FormData): Promise<AdminAssistantState> {
  const condominiumId = formData.get('condominiumId') as string;
  const question = (formData.get('question') as string)?.trim();
  if (!question) return { error: 'Escribe tu pregunta.' };

  // El asistente lee información del condominio para responder: pedir
  // uno ajeno no puede ser una vía para conocerlo.
  const session = await requirePanel({ module: '/app/asistentes-ia', condominiumId });
  if (!session) return { error: SIN_PERMISO };

  const answer = await askAdministrativeAssistant(session.user.companyId, condominiumId, question);
  return { answer };
}
