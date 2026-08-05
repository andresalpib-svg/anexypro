'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { createTaskSchema, updateTaskSchema, checklistItemSchema } from '@/lib/validations/tasks';
import {
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  addTaskAttachment,
  deleteTaskAttachment,
} from '@/lib/services/tasks';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import { taskDestination, condoOfTask } from '@/lib/services/upload-destinations';
import { canAccessCondo } from '@/lib/services/condominiums';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function parseDates(data: { dueDate?: string; alarmAt?: string }) {
  return {
    dueDate: data.dueDate ? new Date(`${data.dueDate}T12:00:00`) : null,
    alarmAt: data.alarmAt ? new Date(data.alarmAt) : null,
  };
}

async function guard() {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) return null;
  return session;
}

/**
 * Un supervisor solo puede ligar tareas a los condominios que tiene
 * asignados. Sin esta guarda bastaría con editar el `value` del select
 * en el navegador para escribir sobre un condominio ajeno.
 */
async function condoAllowed(
  session: { user: { id: string; companyId: string; role: string } },
  condominiumId?: string
): Promise<boolean> {
  if (!condominiumId) return true;
  return canAccessCondo(session, condominiumId);
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'Sesión expirada.' };
  const parsed = createTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  if (!(await condoAllowed(session, parsed.data.condominiumId)))
    return { formError: 'No tienes ese condominio asignado.' };

  try {
    const task = await createTask(session.user.companyId, session.user.id, { ...parsed.data, ...parseDates(parsed.data) });
    // Documento adjunto desde la creación misma de la tarea.
    const file = pickFile(formData, 'file');
    if (file) {
      const url = await saveToRepository(file, taskDestination(parsed.data.condominiumId));
      await addTaskAttachment(session.user.companyId, task.id, file.name, url);
    }
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear la tarea.' };
  }
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function updateTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'Sesión expirada.' };
  const parsed = updateTaskSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const { taskId, ...data } = parsed.data;
  if (!(await condoAllowed(session, data.condominiumId)))
    return { formError: 'No tienes ese condominio asignado.' };

  await updateTask(session.user.companyId, taskId, { ...data, ...parseDates(data) });
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function setTaskStatusAction(taskId: string, status: string) {
  const session = await guard();
  if (!session) return;
  await setTaskStatus(session.user.companyId, taskId, status);
  revalidatePath('/app/gestion');
}

export async function deleteTaskAction(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guard();
  if (!session) return { ok: false, error: 'Sesión expirada.' };
  try {
    await deleteTask(session.user.companyId, taskId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar la tarea.' };
  }
  revalidatePath('/app/gestion');
  return { ok: true };
}

// ---------- Checklist ----------
export async function addChecklistItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'Sesión expirada.' };
  const parsed = checklistItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await addChecklistItem(session.user.companyId, parsed.data.taskId, parsed.data.title);
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function toggleChecklistItemAction(itemId: string, done: boolean) {
  const session = await guard();
  if (!session) return;
  await toggleChecklistItem(session.user.companyId, itemId, done);
  revalidatePath('/app/gestion');
}

export async function deleteChecklistItemAction(itemId: string) {
  const session = await guard();
  if (!session) return;
  await deleteChecklistItem(session.user.companyId, itemId);
  revalidatePath('/app/gestion');
}

// ---------- Adjuntos ----------
export async function addAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guard();
  if (!session) return { formError: 'Sesión expirada.' };
  const taskId = String(formData.get('taskId') ?? '');
  const file = pickFile(formData, 'file');
  if (!taskId || !file) return { formError: 'Adjunta un archivo.' };

  try {
    const url = await saveToRepository(file, taskDestination(await condoOfTask(session.user.companyId, taskId)));
    await addTaskAttachment(session.user.companyId, taskId, file.name, url);
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo adjuntar el archivo.' };
  }
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function deleteAttachmentAction(attachmentId: string) {
  const session = await guard();
  if (!session) return;
  await deleteTaskAttachment(session.user.companyId, attachmentId);
  revalidatePath('/app/gestion');
}
