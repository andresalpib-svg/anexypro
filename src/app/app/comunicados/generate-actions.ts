'use server';

import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { generateCommunicationDraft } from '@/lib/services/comm-generator';

export async function generateDraftAction(instruction: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'comunicados')) return { error: 'No tienes permiso para esta acción.' };
  if (!instruction.trim()) return { error: 'Escribe qué quieres comunicar.' };
  return generateCommunicationDraft(instruction);
}
