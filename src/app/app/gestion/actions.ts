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
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { taskDestination, condoOfTask } from '@/lib/services/upload-destinations';
import { condoOfChecklistItem, condoOfTaskAttachment } from '@/lib/services/entity-scope';
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
 * Guarda para las acciones que solo reciben el id de una tarea o de uno
 * de sus hijos: el condominio se resuelve DESDE la entidad y se
 * comprueba contra los asignados. Sin esto, un supervisor cerraba,
 * borraba o vaciaba tareas de condominios que no administra.
 */
async function guardByCondo(condoId: string | null) {
  const session = await guard();
  if (!session) return null;
  if (!(await condoAllowed(session, condoId ?? undefined))) return null;
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
      await addTaskAttachment(session.user.companyId, task.id, decodeUploadName(file.name), url);
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
  const pre = await guard();
  if (!pre) return;
  const session = await guardByCondo(await condoOfTask(pre.user.companyId, taskId));
  if (!session) return;
  await setTaskStatus(session.user.companyId, taskId, status);
  revalidatePath('/app/gestion');
}

export async function deleteTaskAction(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const pre = await guard();
  if (!pre) return { ok: false, error: 'Sesión expirada.' };
  const session = await guardByCondo(await condoOfTask(pre.user.companyId, taskId));
  if (!session) return { ok: false, error: 'No tienes ese condominio asignado.' };
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
  const parsed = checklistItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const pre = await guard();
  if (!pre) return { formError: 'Sesión expirada.' };
  const session = await guardByCondo(await condoOfTask(pre.user.companyId, parsed.data.taskId));
  if (!session) return { formError: 'No tienes ese condominio asignado.' };

  await addChecklistItem(session.user.companyId, parsed.data.taskId, parsed.data.title);
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function toggleChecklistItemAction(itemId: string, done: boolean) {
  const pre = await guard();
  if (!pre) return;
  const session = await guardByCondo(await condoOfChecklistItem(pre.user.companyId, itemId));
  if (!session) return;
  await toggleChecklistItem(session.user.companyId, itemId, done);
  revalidatePath('/app/gestion');
}

export async function deleteChecklistItemAction(itemId: string) {
  const pre = await guard();
  if (!pre) return;
  const session = await guardByCondo(await condoOfChecklistItem(pre.user.companyId, itemId));
  if (!session) return;
  await deleteChecklistItem(session.user.companyId, itemId);
  revalidatePath('/app/gestion');
}

// ---------- Adjuntos ----------
export async function addAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const pre = await guard();
  if (!pre) return { formError: 'Sesión expirada.' };
  const taskId = String(formData.get('taskId') ?? '');
  const file = pickFile(formData, 'file');
  if (!taskId || !file) return { formError: 'Adjunta un archivo.' };

  const condoId = await condoOfTask(pre.user.companyId, taskId);
  const session = await guardByCondo(condoId);
  if (!session) return { formError: 'No tienes ese condominio asignado.' };

  try {
    const url = await saveToRepository(file, taskDestination(condoId));
    await addTaskAttachment(session.user.companyId, taskId, decodeUploadName(file.name), url);
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo adjuntar el archivo.' };
  }
  revalidatePath('/app/gestion');
  return { success: true };
}

export async function deleteAttachmentAction(attachmentId: string) {
  const pre = await guard();
  if (!pre) return;
  const session = await guardByCondo(await condoOfTaskAttachment(pre.user.companyId, attachmentId));
  if (!session) return;
  await deleteTaskAttachment(session.user.companyId, attachmentId);
  revalidatePath('/app/gestion');
}
