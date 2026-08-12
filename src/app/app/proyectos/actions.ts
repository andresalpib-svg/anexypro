'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePanel } from '@/lib/guard';
import { condoOfProject, condoOfProjectChecklistItem } from '@/lib/services/entity-scope';
import { projectSchema, checklistSchema, updateSchema } from '@/lib/validations/project';
import {
  createProject,
  setProjectStatus,
  addChecklistItem,
  toggleChecklistItem,
  addUpdate,
} from '@/lib/services/projects';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

/**
 * El condominio se resuelve DESDE el proyecto (entity-scope), nunca de
 * un campo del formulario, y se valida contra los asignados: el
 * supervisor solo toca proyectos de sus condominios.
 */
async function guardProject(projectId: string) {
  const pre = await requirePanel({ module: '/app/proyectos' });
  if (!pre) return null;
  const condoId = await condoOfProject(pre.user.companyId, projectId);
  return requirePanel({ module: '/app/proyectos', condominiumId: condoId });
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = projectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/proyectos', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  const project = await createProject(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', {
    ...parsed.data,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
  });
  revalidatePath('/app/proyectos');
  redirect(`/app/proyectos/${project.id}`);
}

export async function setProjectStatusAction(projectId: string, status: string) {
  const session = await guardProject(projectId);
  if (!session) return;
  await setProjectStatus(session.user.companyId, projectId, status);
  revalidatePath(`/app/proyectos/${projectId}`);
}

export async function addChecklistItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = checklistSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const session = await guardProject(parsed.data.projectId);
  if (!session) return SIN_PERMISO;
  await addChecklistItem(session.user.companyId, parsed.data.projectId, parsed.data.title);
  revalidatePath(`/app/proyectos/${parsed.data.projectId}`);
  return { success: true };
}

export async function toggleChecklistItemAction(itemId: string, projectId: string, done: boolean) {
  const session = await guardProject(projectId);
  if (!session) return;
  // `guardProject(projectId)` solo valida el PROYECTO declarado; el
  // `itemId` nunca se ataba a él, así que un supervisor con acceso al
  // proyecto A podía togglear un ítem real de un proyecto del
  // condominio B (auditoría de seguridad 2026-08-11, hallazgo #13).
  const condoDelItem = await condoOfProjectChecklistItem(session.user.companyId, itemId);
  const condoDelProyecto = await condoOfProject(session.user.companyId, projectId);
  if (condoDelItem !== condoDelProyecto) return;
  await toggleChecklistItem(session.user.companyId, itemId, done);
  revalidatePath(`/app/proyectos/${projectId}`);
}

export async function addUpdateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const session = await guardProject(parsed.data.projectId);
  if (!session) return SIN_PERMISO;
  await addUpdate(session.user.companyId, session.user.id, parsed.data);
  revalidatePath(`/app/proyectos/${parsed.data.projectId}`);
  return { success: true };
}
