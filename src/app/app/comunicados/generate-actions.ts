'use server';

import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { generateCommunicationDraft } from '@/lib/services/comm-generator';
import { hitRateLimit } from '@/lib/rate-limit';

export async function generateDraftAction(instruction: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'comunicados')) return { error: 'No tienes permiso para esta acción.' };
  const texto = instruction.trim();
  if (!texto) return { error: 'Escribe qué quieres comunicar.' };
  // Sin tope, una instrucción larguísima infla el costo de la llamada
  // a la API de Anthropic (auditoría de seguridad 2026-08-11, hallazgo
  // #20).
  if (texto.length > 800) return { error: 'La instrucción es demasiado larga — resumila un poco.' };

  const { allowed } = await hitRateLimit(`ia-comunicados:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!allowed) return { error: 'Generaste muchos borradores seguidos — esperá unos minutos.' };

  return generateCommunicationDraft(texto);
}
