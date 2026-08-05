'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { markCommunicationRead } from '@/lib/services/communications';

export async function markReadAction(communicationId: string) {
  const session = await auth();
  if (!session?.user) return;
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return;
  await markCommunicationRead(session.user.companyId, communicationId, ctx.person.id);
  revalidatePath('/portal/comunicados');
  revalidatePath('/portal/dashboard');
}
