'use server';

import { revalidatePath } from 'next/cache';
import { requireSecurity } from '@/lib/guard';
import { incidentSchema, packageSchema } from '@/lib/validations/security';
import { createIncident, setIncidentStatus, receivePackage, deliverPackage } from '@/lib/services/security';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

export async function createIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSecurity();
  if (!session) return { formError: 'No tienes permiso para hacer esto.' };
  const parsed = incidentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  await createIncident(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/seguridad/incidentes');
  revalidatePath('/seguridad/bitacora');
  return { success: true };
}

export async function setIncidentStatusAction(incidentId: string, status: string) {
  const session = await requireSecurity();
  if (!session) return;
  await setIncidentStatus(session.user.companyId, incidentId, status);
  revalidatePath('/seguridad/incidentes');
}

export async function receivePackageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSecurity();
  if (!session) return { formError: 'No tienes permiso para hacer esto.' };
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  await receivePackage(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/seguridad/paquetes');
  revalidatePath('/seguridad/bitacora');
  return { success: true };
}

export async function deliverPackageAction(packageId: string) {
  const session = await requireSecurity();
  if (!session) return;
  await deliverPackage(session.user.companyId, packageId, session.user.id);
  revalidatePath('/seguridad/paquetes');
}
