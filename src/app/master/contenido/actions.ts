'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { forEachCompany } from '@/lib/db';
import { contentItemSchema } from '@/lib/validations/content';
import { createContentItem, togglePublish, deleteContentItem } from '@/lib/services/content';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/** Contenido de Valor es curaduría de plataforma: solo el master lo edita. */
async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

/**
 * El master no pertenece a la empresa del condominio, así que el
 * companyId se resuelve desde el condominio destino — nunca desde la
 * sesión — para que el contexto multi-tenant escriba en el inquilino
 * correcto.
 */
async function companyOfCondo(condominiumId: string): Promise<string | null> {
  // El master no pertenece a ninguna empresa, así que no hay un
  // contexto suyo con el que consultar: se busca el condominio empresa
  // por empresa, con el contexto de cada una. Ver `forEachCompany`.
  const encontrado = await forEachCompany((tx) =>
    tx.condominium.count({ where: { id: condominiumId } })
  );
  return encontrado.find((e) => e.result > 0)?.companyId ?? null;
}

/** Igual que la anterior, pero partiendo de una pieza de contenido. */
async function companyOfContent(itemId: string): Promise<string | null> {
  const encontrado = await forEachCompany((tx) => tx.contentItem.count({ where: { id: itemId } }));
  return encontrado.find((e) => e.result > 0)?.companyId ?? null;
}

export async function createContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master administra el Contenido de Valor.' };

  const parsed = contentItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const companyId = await companyOfCondo(parsed.data.condominiumId);
  if (!companyId) return { formError: 'El condominio ya no existe.' };

  await createContentItem(companyId, session.user.id, session.user.name ?? 'Master', parsed.data);
  revalidatePath('/master/contenido');
  revalidatePath('/app/contenido');
  revalidatePath('/portal/contenido');
  return { success: true };
}

export async function togglePublishAction(itemId: string, publish: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };

  const companyId = await companyOfContent(itemId);
  if (!companyId) return { ok: false, error: 'El contenido ya no existe.' };

  await togglePublish(companyId, itemId, publish);
  revalidatePath('/master/contenido');
  revalidatePath('/app/contenido');
  revalidatePath('/portal/contenido');
  return { ok: true };
}

export async function deleteContentAction(itemId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };

  const companyId = await companyOfContent(itemId);
  if (!companyId) return { ok: false, error: 'El contenido ya no existe.' };

  await deleteContentItem(companyId, itemId);
  revalidatePath('/master/contenido');
  revalidatePath('/app/contenido');
  revalidatePath('/portal/contenido');
  return { ok: true };
}
