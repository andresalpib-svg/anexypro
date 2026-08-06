'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { requireSecurity } from '@/lib/guard';
import { visitSchema } from '@/lib/validations/security';
import { createVisit, checkIn, checkOut } from '@/lib/services/visits';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import { condoOfVisit } from '@/lib/services/upload-destinations';
import { condoOfCheckin } from '@/lib/services/entity-scope';
import type { Session } from 'next-auth';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function officer(session: Session) {
  return { userId: session.user.id, userName: session.user.name ?? 'Oficial de seguridad' };
}

const AJENO = 'Ese registro es de un condominio que no tienes asignado.';

/**
 * Sesión de caseta con derecho sobre el condominio de la entidad.
 *
 * `resolver` lee el condominio DESDE LA BASE por el id de la entidad, y
 * lanza si el id no existe o es de otra empresa. Se atrapa aquí para
 * devolver un mensaje en vez de un error crudo: la caseta trabaja con
 * pantallas que se refrescan solas cada 10 segundos, así que un id que
 * acaba de dejar de existir es algo normal, no una anomalía.
 */
async function casetaSobre(resolver: () => Promise<string>): Promise<Session | null> {
  try {
    return await requireSecurity(await resolver());
  } catch {
    return null;
  }
}

export async function createVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = visitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  // El condominio del formulario se comprueba contra los asignados: el
  // id viaja en un campo y se cambia desde el navegador.
  const session = await requireSecurity(parsed.data.condominiumId);
  if (!session) return { formError: 'No tienes permiso para hacer esto.' };

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
  const previa = await auth();
  if (!previa?.user || previa.user.role !== 'seguridad') return { ok: false, error: 'Sesión expirada.' };
  // El condominio se resuelve desde la BASE por el id de la
  // autorización, nunca desde el cliente.
  const session = await casetaSobre(() => condoOfVisit(previa.user.companyId, authorizationId));
  if (!session) return { ok: false, error: AJENO };
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
  const previa = await auth();
  if (!previa?.user || previa.user.role !== 'seguridad') return { formError: 'Sesión expirada.' };
  const authorizationId = String(formData.get('authorizationId') ?? '');
  const override = formData.get('override') === 'true';
  let condoId: string;
  try {
    condoId = await condoOfVisit(previa.user.companyId, authorizationId);
  } catch {
    return { formError: AJENO };
  }
  const session = await requireSecurity(condoId);
  if (!session) return { formError: AJENO };
  try {
    const file = pickFile(formData, 'evidence');
    const evidencePhotoUrl = file ? await saveToRepository(file, { kind: 'condo', condominiumId: condoId, slug: 'seguridad/visitas' }) : undefined;
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
  const previa = await auth();
  if (!previa?.user || previa.user.role !== 'seguridad') return { ok: false, error: 'Sesión expirada.' };
  const session = await casetaSobre(() => condoOfCheckin(previa.user.companyId, checkinId));
  if (!session) return { ok: false, error: AJENO };
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
