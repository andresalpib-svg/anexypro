'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { inviteUserSchema } from '@/lib/validations/settings';
import {
  inviteStaffUser,
  toggleStaffPermission,
  toggleBoardMember,
  toggleBoardArea,
  listManageableUsers,
  setUserPassword,
} from '@/lib/services/settings';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function ownerGuard(session: any) {
  if (!session?.user) return 'Sesión expirada.';
  if (session.user.role !== 'admin_owner') return 'Solo el administrador principal puede gestionar permisos.';
  return null;
}

export async function inviteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = ownerGuard(session);
  if (err) return { formError: err };
  const parsed = inviteUserSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    await inviteStaffUser(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', parsed.data);
  } catch (err: any) {
    if (err?.code === 'P2002') return { formError: 'Ya existe un usuario con ese correo en tu empresa.' };
    return { formError: 'No se pudo crear el usuario.' };
  }
  revalidatePath('/app/configuracion');
  return { success: true };
}

/**
 * Los tres interruptores de esta pantalla se disparan desde un
 * `onChange` del navegador. Si la acción LANZA, React entrega la
 * excepción a la frontera de error y la pantalla entera se sustituye
 * por "Algo salió mal" con un código — que es lo peor que puede pasarle
 * a quien solo marcó una casilla: pierde de vista la tabla completa y
 * no sabe si el cambio quedó.
 *
 * Los servicios que hay detrás usan `findFirstOrThrow`/`update`, así
 * que lanzan en cuanto el usuario o la persona ya no existe (otra
 * pestaña, un dato borrado). Por eso las tres devuelven el resultado y
 * la casilla se revierte sola si algo falló.
 */
export type ToggleResult = { ok: boolean; error?: string };

const NO_EXISTE = 'Ese registro ya no existe. Actualizá la pantalla.';

function motivo(e: any, porOmision: string): string {
  if (e?.code === 'P2025' || e?.name === 'NotFoundError') return NO_EXISTE;
  return e?.message ?? porOmision;
}

export async function toggleStaffPermissionAction(
  userId: string,
  area: string,
  allowed: boolean
): Promise<ToggleResult> {
  const session = await auth();
  const err = ownerGuard(session);
  if (err) return { ok: false, error: err };
  try {
    await toggleStaffPermission(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', userId, area, allowed);
  } catch (e: any) {
    return { ok: false, error: motivo(e, 'No se pudo cambiar el permiso.') };
  }
  revalidatePath('/app/configuracion');
  return { ok: true };
}

export async function toggleBoardMemberAction(
  personId: string,
  isBoardMember: boolean
): Promise<ToggleResult> {
  const session = await auth();
  const err = ownerGuard(session);
  if (err) return { ok: false, error: err };
  try {
    await toggleBoardMember(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', personId, isBoardMember);
  } catch (e: any) {
    return { ok: false, error: motivo(e, 'No se pudo cambiar la Junta Directiva.') };
  }
  revalidatePath('/app/configuracion');
  return { ok: true };
}

// ---------- Contraseña fijada a mano ----------

export type ManageableUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};

/** Buscador de usuarios de la empresa para el bloque de contraseñas. */
export async function searchUsersAction(query: string): Promise<ManageableUser[]> {
  const session = await auth();
  if (ownerGuard(session)) return [];
  const users = await listManageableUsers(session!.user.companyId, query);
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  }));
}

export async function setUserPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  const err = ownerGuard(session);
  if (err) return { formError: err };

  const userId = String(formData.get('userId') ?? '');
  const nueva = String(formData.get('nueva') ?? '');
  const repetir = String(formData.get('repetir') ?? '');

  if (!userId) return { formError: 'Elegí primero al usuario.' };
  if (nueva.length < 8) return { formError: 'La contraseña debe tener al menos 8 caracteres.' };
  if (nueva !== repetir) return { formError: 'La contraseña y su repetición no coinciden.' };

  try {
    await setUserPassword(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', userId, nueva);
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo cambiar la contraseña.' };
  }
  revalidatePath('/app/configuracion');
  return { success: true };
}

export async function toggleBoardAreaAction(
  personId: string,
  area: string,
  allowed: boolean
): Promise<ToggleResult> {
  const session = await auth();
  const err = ownerGuard(session);
  if (err) return { ok: false, error: err };
  try {
    await toggleBoardArea(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', personId, area, allowed);
  } catch (e: any) {
    return { ok: false, error: motivo(e, 'No se pudo cambiar el área de Junta.') };
  }
  revalidatePath('/app/configuracion');
  return { ok: true };
}
