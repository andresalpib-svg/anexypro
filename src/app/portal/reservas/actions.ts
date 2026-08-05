'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getCompanySubscription } from '@/lib/services/subscriptions';
import { reservationSchema } from '@/lib/validations/reservation';
import { createReservation } from '@/lib/services/reservations';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

export async function createMyReservationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  const ctx = await getResidentContext(session.user.id);
  if (!ctx) return { formError: 'Tu cuenta no está vinculada a ninguna unidad.' };

  // Con la suscripción de la administradora bloqueada, las funciones de
  // acceso dejan de operar. Se comprueba aquí y no ocultando el botón:
  // esconder un formulario no impide enviarlo.
  const suscripcion = await getCompanySubscription(session.user.companyId);
  if (suscripcion.blocked) {
    return { formError: 'En este momento no es posible reservar áreas comunes. Comunicate con la administración de tu condominio.' };
  }

  const raw = { ...Object.fromEntries(formData.entries()), propertyId: ctx.property.id };
  const parsed = reservationSchema.safeParse(raw);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    const receiptFile = pickFile(formData, 'receipt');
    const receiptUrl = receiptFile ? await saveToRepository(receiptFile, { kind: 'condo', condominiumId: ctx.condominium.id, slug: 'seguridad/reservas' }) : undefined;
    await createReservation(session.user.companyId, {
      ...parsed.data,
      resDate: new Date(parsed.data.resDate),
      receiptUrl,
      requireReceiptIfCost: true,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo crear la reserva.' };
  }
  revalidatePath('/portal/reservas');
  return { success: true };
}
