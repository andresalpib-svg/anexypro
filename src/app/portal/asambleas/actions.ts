'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { castBallot } from '@/lib/services/assemblies';

export type BallotState = { error?: string; success?: boolean };

export async function castBallotAction(_prev: BallotState, formData: FormData): Promise<BallotState> {
  const session = await auth();
  if (!session?.user) return { error: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { error: 'Tu cuenta no está vinculada a ninguna unidad.' };

  const voteId = formData.get('voteId') as string;
  const assemblyId = formData.get('assemblyId') as string;
  const choice = formData.get('choice') as string;

  try {
    // propertyId viene SIEMPRE de la sesión resuelta del residente —
    // nunca de un campo del formulario que se pudiera manipular.
    await castBallot(session.user.companyId, { voteId, propertyId: ctx.property.id, voterName: ctx.person.fullName, choice });
  } catch (err: any) {
    if (err?.code === 'P2002') return { error: 'Tu unidad ya emitió un voto en esta votación — no se puede votar dos veces.' };
    return { error: err?.message ?? 'No se pudo registrar el voto.' };
  }
  revalidatePath(`/portal/asambleas/${assemblyId}`);
  return { success: true };
}
