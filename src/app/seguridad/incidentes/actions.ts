'use server';

import { revalidatePath } from 'next/cache';
import { requireSecurity } from '@/lib/guard';
import { incidentSchema, packageSchema } from '@/lib/validations/security';
import { createIncident, setIncidentStatus, receivePackage, deliverPackage } from '@/lib/services/security';
import { condoOfIncident, condoOfPackage } from '@/lib/services/entity-scope';
import { auth } from '@/lib/auth';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = 'No tienes permiso para hacer esto.';

/**
 * Sesión de caseta con derecho sobre el condominio de la entidad.
 *
 * `resolver` lee el condominio DESDE LA BASE por el id, y lanza si el
 * id no existe o es de otra empresa; se atrapa aquí para no devolver un
 * error crudo desde una pantalla que se refresca sola.
 */
async function casetaSobre(resolver: () => Promise<string>) {
  try {
    return await requireSecurity(await resolver());
  } catch {
    return null;
  }
}

export async function createIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = incidentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  // El condominio se comprueba con el valor ya validado del formulario.
  const session = await requireSecurity(parsed.data.condominiumId);
  if (!session) return { formError: SIN_PERMISO };
  await createIncident(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/seguridad/incidentes');
  revalidatePath('/seguridad/bitacora');
  return { success: true };
}

export async function setIncidentStatusAction(incidentId: string, status: string) {
  // El condominio no viene en la llamada: se resuelve DESDE LA BASE por
  // el id del incidente, nunca desde el cliente.
  const primero = await auth();
  if (!primero?.user || primero.user.role !== 'seguridad') return;
  const session = await casetaSobre(() => condoOfIncident(primero.user.companyId, incidentId));
  if (!session) return;
  await setIncidentStatus(session.user.companyId, incidentId, status);
  revalidatePath('/seguridad/incidentes');
}

export async function receivePackageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const session = await requireSecurity(parsed.data.condominiumId);
  if (!session) return { formError: SIN_PERMISO };
  await receivePackage(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/seguridad/paquetes');
  revalidatePath('/seguridad/bitacora');
  return { success: true };
}

export async function deliverPackageAction(packageId: string) {
  const primero = await auth();
  if (!primero?.user || primero.user.role !== 'seguridad') return;
  const session = await casetaSobre(() => condoOfPackage(primero.user.companyId, packageId));
  if (!session) return;
  await deliverPackage(session.user.companyId, packageId, session.user.id);
  revalidatePath('/seguridad/paquetes');
}
