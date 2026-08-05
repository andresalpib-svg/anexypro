'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { incidentSchema, packageSchema } from '@/lib/validations/security';
import { createIncident, setIncidentStatus, receivePackage, deliverPackage } from '@/lib/services/security';
import { condoOfIncident, condoOfPackage, condoOfProperty } from '@/lib/services/entity-scope';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const MODULO = '/app/seguridad';

export async function createIncidentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = incidentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO, condominiumId: parsed.data.condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  await createIncident(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/app/seguridad');
  return { success: true };
}

export async function setIncidentStatusAction(incidentId: string, status: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return;
  const condoId = await condoOfIncident(session.user.companyId, incidentId);
  if (!(await allowsCondo(session, condoId))) return;

  await setIncidentStatus(session.user.companyId, incidentId, status);
  revalidatePath('/app/seguridad');
}

export async function receivePackageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = packageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO });
  if (!session) return { formError: SIN_PERMISO };
  // El condominio se toma de la unidad destinataria del paquete.
  const condoId = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  await receivePackage(session.user.companyId, session.user.id, parsed.data);
  revalidatePath('/app/seguridad');
  return { success: true };
}

export async function deliverPackageAction(packageId: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return;
  const condoId = await condoOfPackage(session.user.companyId, packageId);
  if (!(await allowsCondo(session, condoId))) return;

  await deliverPackage(session.user.companyId, packageId, session.user.id);
  revalidatePath('/app/seguridad');
}
