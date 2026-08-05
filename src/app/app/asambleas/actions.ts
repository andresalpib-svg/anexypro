'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { assemblySchema, minutesSchema } from '@/lib/validations/assembly';
import { createAssembly, openVote, closeVote, publishMinutes } from '@/lib/services/assemblies';

export type ActionState = { errors?: Record<string, string[]>; formError?: string };

function guard(session: any) {
  if (!session?.user) return 'Sesión expirada.';
  if (!can(session, 'asambleas')) return 'No tienes permiso para esta acción.';
  return null;
}

export async function createAssemblyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };

  const raw = Object.fromEntries(formData.entries());
  const parsed = assemblySchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const topics = parsed.data.topics.split('\n').map((t) => t.trim()).filter(Boolean);
  const assembly = await createAssembly(session!.user.companyId, session!.user.id, session!.user.name ?? session!.user.email ?? 'Usuario', { ...parsed.data, eventDate: new Date(parsed.data.eventDate), topics });
  revalidatePath('/app/asambleas');
  redirect(`/app/asambleas/${assembly.id}`);
}

export async function openVoteAction(topicId: string, assemblyId: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'asambleas')) return;
  await openVote(session.user.companyId, topicId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  revalidatePath(`/app/asambleas/${assemblyId}`);
}

export async function closeVoteAction(topicId: string, assemblyId: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'asambleas')) return;
  await closeVote(session.user.companyId, topicId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  revalidatePath(`/app/asambleas/${assemblyId}`);
}

export async function publishMinutesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = minutesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await publishMinutes(session!.user.companyId, session!.user.id, session!.user.name ?? session!.user.email ?? 'Usuario', parsed.data.assemblyId, parsed.data.minutesBody);
  revalidatePath(`/app/asambleas/${parsed.data.assemblyId}`);
  return {};
}

// NO existe castBallotAction ni ninguna función equivalente aquí —
// ver el comentario en src/lib/services/assemblies.ts.
