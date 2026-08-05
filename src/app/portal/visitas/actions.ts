'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getCompanySubscription } from '@/lib/services/subscriptions';
import { visitSchema } from '@/lib/validations/security';
import { createVisit, setVisitStatus } from '@/lib/services/visits';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function parseDates(d: { validDate?: string; startDate?: string; endDate?: string }) {
  return {
    validDate: d.validDate ? new Date(`${d.validDate}T12:00:00`) : undefined,
    startDate: d.startDate ? new Date(`${d.startDate}T12:00:00`) : undefined,
    endDate: d.endDate ? new Date(`${d.endDate}T12:00:00`) : undefined,
  };
}

export async function authorizeVisitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { formError: 'Tu cuenta no está vinculada a ninguna unidad.' };

  // Con la suscripción de la administradora bloqueada, las funciones de
  // acceso dejan de operar. Se comprueba aquí y no ocultando el botón:
  // esconder un formulario no impide enviarlo.
  const suscripcion = await getCompanySubscription(session.user.companyId);
  if (suscripcion.blocked) {
    return { formError: 'En este momento no es posible autorizar visitas. Comunicate con la administración de tu condominio.' };
  }

  const raw = { ...Object.fromEntries(formData.entries()), propertyId: ctx.property.id, condominiumId: ctx.condominium.id };
  const parsed = visitSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // Días permitidos (recurrentes/empleados) — checkboxes múltiples.
  const allowedDays = formData.getAll('allowedDays').map(Number).filter((d) => d >= 0 && d <= 6);

  try {
    const photoFile = pickFile(formData, 'photo');
    const visitorPhotoUrl = photoFile ? await saveToRepository(photoFile, { kind: 'condo', condominiumId: ctx.condominium.id, slug: 'seguridad/visitas' }) : undefined;

    await createVisit(session.user.companyId, session.user.id, session.user.name ?? 'Residente', false, {
      ...parsed.data,
      ...parseDates(parsed.data),
      allowedDays,
      visitorPhotoUrl,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo autorizar la visita.' };
  }
  revalidatePath('/portal/visitas');
  return { success: true };
}

/** Cancelar / suspender / reactivar — SOLO autorizaciones de la propia unidad. */
export async function setMyVisitStatusAction(
  authorizationId: string,
  status: 'cancelada' | 'suspendida' | 'vigente'
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { ok: false, error: 'Tu cuenta no está vinculada a ninguna unidad.' };

  const suscripcion = await getCompanySubscription(session.user.companyId);
  if (suscripcion.blocked) {
    return { ok: false, error: 'En este momento no es posible autorizar visitas. Comunicate con la administración de tu condominio.' };
  }

  try {
    const { withTenantContext } = await import('@/lib/db');
    const visit = await withTenantContext(session.user.companyId, (tx) =>
      tx.visitAuthorization.findFirst({ where: { id: authorizationId, propertyId: ctx.property.id } })
    );
    if (!visit) return { ok: false, error: 'Esa autorización no pertenece a tu unidad.' };
    await setVisitStatus(session.user.companyId, authorizationId, status, {
      userId: session.user.id,
      userName: session.user.name ?? 'Residente',
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo actualizar la autorización.' };
  }
  revalidatePath('/portal/visitas');
  return { ok: true };
}
