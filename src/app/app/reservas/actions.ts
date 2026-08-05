'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { amenitySchema, reservationSchema } from '@/lib/validations/reservation';
import { createAmenity } from '@/lib/services/amenities';
import { createReservation, decideReservation } from '@/lib/services/reservations';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import { condoOfAmenity, condoOfReservation, condoOfSchedule } from '@/lib/services/entity-scope';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/**
 * Las áreas comunes son parte del condominio: quien las crea, edita o
 * elimina tiene que tener ese condominio a su cargo. Cuando la acción
 * solo recibe el identificador del área, el condominio se deduce del
 * área misma — el formulario no es fuente de autoridad.
 */

export async function createAmenityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = amenitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const condoId = parsed.data.condominiumId;
  const session = await requirePanel({ module: '/app/reservas', condominiumId: condoId });
  if (!session) return { formError: SIN_PERMISO };

  try {
    const rulesFile = pickFile(formData, 'rulesFile');
    const rulesUrl = rulesFile
      ? await saveToRepository(rulesFile, { kind: 'condo', condominiumId: condoId, slug: 'administracion/reglamentos' })
      : undefined;
    const photoFile = pickFile(formData, 'photo');
    const photoUrl = photoFile
      ? await saveToRepository(photoFile, { kind: 'condo', condominiumId: condoId, slug: 'multimedia/fotografias' }, { allowedExt: IMAGE_EXT })
      : undefined;
    await createAmenity(session.user.companyId, { ...parsed.data, rulesUrl, photoUrl });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo crear el área.' };
  }
  revalidatePath('/app/reservas');
  return { success: true };
}

export async function addScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amenityId = String(formData.get('amenityId') ?? '');
  const days = formData.getAll('days').map(Number).filter((d) => d >= 0 && d <= 6);
  const opensAt = String(formData.get('opensAt') ?? '');
  const closesAt = String(formData.get('closesAt') ?? '');
  if (!amenityId || days.length === 0 || !opensAt || !closesAt) {
    return { formError: 'Selecciona al menos un día y el rango de horas.' };
  }
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hora.test(opensAt) || !hora.test(closesAt)) {
    return { formError: 'Las horas deben tener el formato HH:mm.' };
  }
  if (closesAt <= opensAt) {
    return { formError: 'La hora de cierre debe ser posterior a la de apertura.' };
  }

  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return { formError: SIN_PERMISO };
  const condoId = await condoOfAmenity(session.user.companyId, amenityId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  try {
    const { addScheduleBlocks } = await import('@/lib/services/amenities');
    await addScheduleBlocks(session.user.companyId, amenityId, days, opensAt, closesAt);
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar el bloque de horario.' };
  }
  revalidatePath('/app/reservas');
  return { success: true };
}

export async function deleteScheduleAction(scheduleId: string) {
  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return;
  const condoId = await condoOfSchedule(session.user.companyId, scheduleId);
  if (!(await allowsCondo(session, condoId))) return;

  const { deleteScheduleBlock } = await import('@/lib/services/amenities');
  await deleteScheduleBlock(session.user.companyId, scheduleId);
  revalidatePath('/app/reservas');
}

export async function createReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = reservationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return { formError: SIN_PERMISO };
  // El condominio se toma del área común reservada, no del formulario.
  const condoId = await condoOfAmenity(session.user.companyId, parsed.data.amenityId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  try {
    const receiptFile = pickFile(formData, 'receipt');
    const receiptUrl = receiptFile
      ? await saveToRepository(receiptFile, { kind: 'condo', condominiumId: condoId, slug: 'seguridad/reservas' })
      : undefined;
    await createReservation(session.user.companyId, {
      ...parsed.data,
      resDate: new Date(`${parsed.data.resDate}T12:00:00`),
      receiptUrl,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo crear la reserva.' };
  }

  revalidatePath('/app/reservas');
  return { success: true };
}

export async function decideReservationAction(
  reservationId: string,
  decision: 'confirmada' | 'rechazada'
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfReservation(session.user.companyId, reservationId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    await decideReservation(session.user.companyId, session.user.id, { reservationId, decision });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo actualizar la reserva.' };
  }
  revalidatePath('/app/reservas');
  return { ok: true };
}

/** Edición completa del área común desde el panel de la administración. */
export async function updateAmenityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const amenityId = String(formData.get('amenityId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!amenityId || name.length < 2) return { formError: 'Indica el nombre del área.' };

  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return { formError: SIN_PERMISO };
  // Al editar no viene el condominio: se toma del área misma.
  const condoId = await condoOfAmenity(session.user.companyId, amenityId);
  if (!(await allowsCondo(session, condoId))) return { formError: SIN_PERMISO };

  const num = (key: string) => {
    const v = String(formData.get(key) ?? '').trim();
    return v === '' ? undefined : Number(v);
  };

  try {
    const { updateAmenity } = await import('@/lib/services/amenities');
    const rulesFile = pickFile(formData, 'rulesFile');
    const photoFile = pickFile(formData, 'photo');
    await updateAmenity(session.user.companyId, amenityId, {
      name,
      capacity: num('capacity'),
      reservationCost: num('reservationCost') ?? 0,
      requiresApproval: formData.get('requiresApproval') === 'on',
      exclusivePerDay: formData.get('exclusivePerDay') === 'on',
      maxHours: num('maxHours'),
      advanceDays: num('advanceDays'),
      status: String(formData.get('status') ?? '') || undefined,
      rulesUrl: rulesFile
        ? await saveToRepository(rulesFile, { kind: 'condo', condominiumId: condoId, slug: 'administracion/reglamentos' })
        : undefined,
      photoUrl: photoFile
        ? await saveToRepository(photoFile, { kind: 'condo', condominiumId: condoId, slug: 'multimedia/fotografias' }, { allowedExt: IMAGE_EXT })
        : undefined,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo actualizar el área.' };
  }
  revalidatePath('/app/reservas');
  return { success: true };
}

export async function deleteAmenityAction(amenityId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: '/app/reservas' });
  if (!session) return { ok: false, error: SIN_PERMISO };
  const condoId = await condoOfAmenity(session.user.companyId, amenityId);
  if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

  try {
    const { deleteAmenity } = await import('@/lib/services/amenities');
    await deleteAmenity(session.user.companyId, amenityId);
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo eliminar el área.' };
  }
  revalidatePath('/app/reservas');
  return { ok: true };
}
