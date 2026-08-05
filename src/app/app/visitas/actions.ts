'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { visitSchema } from '@/lib/validations/security';
import { createVisit, checkIn, checkOut, setVisitStatus } from '@/lib/services/visits';
import { condoOfVisit, condoOfCheckin } from '@/lib/services/entity-scope';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const MODULO = '/app/visitas';

export async function createVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = visitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  const allowedDays = formData.getAll('allowedDays').map(Number).filter((d) => d >= 0 && d <= 6);

  try {
    await createVisit(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', false, {
      ...parsed.data,
      validDate: parsed.data.validDate ? new Date(`${parsed.data.validDate}T12:00:00`) : undefined,
      startDate: parsed.data.startDate ? new Date(`${parsed.data.startDate}T12:00:00`) : undefined,
      endDate: parsed.data.endDate ? new Date(`${parsed.data.endDate}T12:00:00`) : undefined,
      allowedDays,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo crear la visita.' };
  }
  revalidatePath('/app/visitas');
  return { success: true };
}

export async function checkInAction(authorizationId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfVisit(session.user.companyId, authorizationId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await checkIn(session.user.companyId, authorizationId, {
      userId: session.user.id,
      userName: session.user.name ?? 'Administración',
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo registrar el ingreso.' };
  }
  revalidatePath('/app/visitas');
  return { ok: true };
}

export async function checkOutAction(checkinId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfCheckin(session.user.companyId, checkinId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await checkOut(session.user.companyId, checkinId, {
      userId: session.user.id,
      userName: session.user.name ?? 'Administración',
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo registrar la salida.' };
  }
  revalidatePath('/app/visitas');
  return { ok: true };
}

export async function adminSetVisitStatusAction(
  authorizationId: string,
  status: 'cancelada' | 'suspendida' | 'vigente'
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO, roles: ['admin_owner', 'admin_staff'] });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfVisit(session.user.companyId, authorizationId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await setVisitStatus(session.user.companyId, authorizationId, status, {
      userId: session.user.id,
      userName: session.user.name ?? 'Administración',
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo actualizar la autorización.' };
  }
  revalidatePath('/app/visitas');
  return { ok: true };
}
