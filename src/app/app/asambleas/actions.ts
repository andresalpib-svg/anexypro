'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePanel } from '@/lib/guard';
import { condoOfAssembly, condoOfAssemblyTopic } from '@/lib/services/entity-scope';
import { assemblySchema, minutesSchema } from '@/lib/validations/assembly';
import { createAssembly, openVote, closeVote, publishMinutes } from '@/lib/services/assemblies';

export type ActionState = { errors?: Record<string, string[]>; formError?: string };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

export async function createAssemblyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = assemblySchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // El condominio del formulario se valida contra los asignados: el
  // supervisor no convoca asambleas en condominios ajenos.
  const session = await requirePanel({ module: '/app/asambleas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  const topics = parsed.data.topics.split('\n').map((t) => t.trim()).filter(Boolean);
  const assembly = await createAssembly(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', { ...parsed.data, eventDate: new Date(parsed.data.eventDate), topics });
  revalidatePath('/app/asambleas');
  redirect(`/app/asambleas/${assembly.id}`);
}

export async function openVoteAction(topicId: string, assemblyId: string) {
  // El condominio se resuelve DESDE la entidad, nunca del argumento.
  const pre = await requirePanel({ module: '/app/asambleas' });
  if (!pre) return;
  const condoId = await condoOfAssemblyTopic(pre.user.companyId, topicId);
  const session = await requirePanel({ module: '/app/asambleas', condominiumId: condoId });
  if (!session) return;
  await openVote(session.user.companyId, topicId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  revalidatePath(`/app/asambleas/${assemblyId}`);
}

export async function closeVoteAction(topicId: string, assemblyId: string) {
  const pre = await requirePanel({ module: '/app/asambleas' });
  if (!pre) return;
  const condoId = await condoOfAssemblyTopic(pre.user.companyId, topicId);
  const session = await requirePanel({ module: '/app/asambleas', condominiumId: condoId });
  if (!session) return;
  await closeVote(session.user.companyId, topicId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  revalidatePath(`/app/asambleas/${assemblyId}`);
}

export async function publishMinutesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = minutesSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const pre = await requirePanel({ module: '/app/asambleas' });
  if (!pre) return SIN_PERMISO;
  const condoId = await condoOfAssembly(pre.user.companyId, parsed.data.assemblyId);
  const session = await requirePanel({ module: '/app/asambleas', condominiumId: condoId });
  if (!session) return SIN_PERMISO;

  await publishMinutes(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', parsed.data.assemblyId, parsed.data.minutesBody);
  revalidatePath(`/app/asambleas/${parsed.data.assemblyId}`);
  return {};
}

// NO existe castBallotAction ni ninguna función equivalente aquí —
// ver el comentario en src/lib/services/assemblies.ts.
