'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { visitSchema } from '@/lib/validations/security';
import { createVisit, checkIn, checkOut } from '@/lib/services/visits';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import { condoOfVisit } from '@/lib/services/upload-destinations';
import type { Session } from 'next-auth';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function officer(session: Session) {
  return { userId: session.user.id, userName: session.user.name ?? 'Oficial de seguridad' };
}

export async function createVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') return { formError: 'Sesión expirada.' };
  const parsed = visitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    await createVisit(session.user.companyId, session.user.id, session.user.name ?? 'Oficial', true, {
      ...parsed.data,
      validDate: parsed.data.validDate ? new Date(`${parsed.data.validDate}T12:00:00`) : undefined,
      startDate: undefined,
      endDate: undefined,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo crear la visita.' };
  }
  revalidatePath('/seguridad/visitas');
  return { success: true };
}

/**
 * Ingreso en un toque. `override=true` solo aplica a empleados fuera
 * de horario (aprobación manual, queda auditada).
 */
export async function securityCheckInAction(
  authorizationId: string,
  override = false
): Promise<{ ok: boolean; error?: string; requiresOverride?: boolean }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') return { ok: false, error: 'Sesión expirada.' };
  try {
    await checkIn(session.user.companyId, authorizationId, officer(session), { override });
  } catch (err: any) {
    const msg = err?.message ?? 'No se pudo registrar el ingreso.';
    return { ok: false, error: msg, requiresOverride: msg.includes('FUERA DE HORARIO') };
  }
  revalidatePath('/seguridad/visitas');
  revalidatePath('/seguridad/dashboard');
  return { ok: true };
}

/** Ingreso con evidencia fotográfica y observaciones (mismo flujo, con archivo). */
export async function securityCheckInWithEvidenceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') return { formError: 'Sesión expirada.' };
  const authorizationId = String(formData.get('authorizationId') ?? '');
  const override = formData.get('override') === 'true';
  try {
    const file = pickFile(formData, 'evidence');
    const evidencePhotoUrl = file ? await saveToRepository(file, { kind: 'condo', condominiumId: await condoOfVisit(session.user.companyId, authorizationId), slug: 'seguridad/visitas' }) : undefined;
    await checkIn(session.user.companyId, authorizationId, officer(session), {
      override,
      evidencePhotoUrl,
      notes: String(formData.get('notes') ?? '') || undefined,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el ingreso.' };
  }
  revalidatePath('/seguridad/visitas');
  revalidatePath('/seguridad/dashboard');
  return { success: true };
}

export async function securityCheckOutAction(checkinId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') return { ok: false, error: 'Sesión expirada.' };
  try {
    await checkOut(session.user.companyId, checkinId, officer(session));
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo registrar la salida.' };
  }
  revalidatePath('/seguridad/visitas');
  revalidatePath('/seguridad/dashboard');
  return { ok: true };
}

// El personal de seguridad NO puede crear recurrentes/empleados (lo
// valida también el servicio), ni suspender/cancelar autorizaciones,
// ni modificar horarios — esas capacidades viven en el portal del
// residente y en el panel Administradora.
