'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { inviteUserSchema } from '@/lib/validations/settings';
import { inviteStaffUser, toggleStaffPermission, toggleBoardMember, toggleBoardArea } from '@/lib/services/settings';

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

export async function toggleStaffPermissionAction(userId: string, area: string, allowed: boolean) {
  const session = await auth();
  if (ownerGuard(session)) return;
  await toggleStaffPermission(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', userId, area, allowed);
  revalidatePath('/app/configuracion');
}

export async function toggleBoardMemberAction(personId: string, isBoardMember: boolean) {
  const session = await auth();
  if (ownerGuard(session)) return;
  await toggleBoardMember(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', personId, isBoardMember);
  revalidatePath('/app/configuracion');
}

export async function toggleBoardAreaAction(personId: string, area: string, allowed: boolean) {
  const session = await auth();
  if (ownerGuard(session)) return;
  await toggleBoardArea(session!.user.companyId, session!.user.id, session!.user.name ?? 'Usuario', personId, area, allowed);
  revalidatePath('/app/configuracion');
}
