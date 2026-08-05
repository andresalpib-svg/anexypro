'use server';

import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getPropertySuspension } from '@/lib/services/finance';
import { askLegalArbiter, type LegalAnswer } from '@/lib/services/legal-assistant';

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

  const answer = await askLegalArbiter(session.user.companyId, ctx.condominium.id, question);
  return { answer };
}
