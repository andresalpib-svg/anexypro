'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { projectSchema, milestoneSchema, checklistSchema, expenseSchema, updateSchema } from '@/lib/validations/project';
import {
  createProject,
  setProjectStatus,
  addMilestone,
  toggleMilestone,
  addChecklistItem,
  toggleChecklistItem,
  addExpense,
  addUpdate,
} from '@/lib/services/projects';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function guard(session: any) {
  if (!session?.user) return 'Sesión expirada.';
  if (!can(session, 'proyectos')) return 'No tienes permiso para esta acción.';
  return null;
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = projectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const project = await createProject(session!.user.companyId, session!.user.id, session!.user.name ?? session!.user.email ?? 'Usuario', {
    ...parsed.data,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
  });
  revalidatePath('/app/proyectos');
  redirect(`/app/proyectos/${project.id}`);
}

export async function setProjectStatusAction(projectId: string, status: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'proyectos')) return;
  await setProjectStatus(session.user.companyId, projectId, status);
  revalidatePath(`/app/proyectos/${projectId}`);
}



export async function addChecklistItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = checklistSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  await addChecklistItem(session!.user.companyId, parsed.data.projectId, parsed.data.title);
  revalidatePath(`/app/proyectos/${parsed.data.projectId}`);
  return { success: true };
}

export async function toggleChecklistItemAction(itemId: string, projectId: string, done: boolean) {
  const session = await auth();
  if (!session?.user || !can(session, 'proyectos')) return;
  await toggleChecklistItem(session.user.companyId, itemId, done);
  revalidatePath(`/app/proyectos/${projectId}`);
}


export async function addUpdateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = guard(session);
  if (err) return { formError: err };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  await addUpdate(session!.user.companyId, session!.user.id, parsed.data);
  revalidatePath(`/app/proyectos/${parsed.data.projectId}`);
  return { success: true };
}
