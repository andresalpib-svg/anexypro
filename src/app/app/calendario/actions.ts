'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePanel, SIN_PERMISO } from '@/lib/guard';
import { createCalendarEvent } from '@/lib/services/calendar';

const eventSchema = z.object({
  condominiumId: z.string().uuid(),
  title: z.string().min(2, 'Indica un título').max(150),
  eventType: z.enum(['mantenimiento', 'asamblea', 'reserva', 'corte_servicio', 'actividad', 'otro']),
  eventDate: z.string().min(1, 'Indica la fecha'),
  eventTime: z.string().optional().or(z.literal('')),
  audience: z.enum(['interna', 'condominos']).default('condominos'),
  description: z.string().max(1000).optional().or(z.literal('')),
  location: z.string().max(120).optional().or(z.literal('')),
});

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = eventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // El condominio llega en un campo oculto: hay que comprobar que sea
  // uno de los que esta sesión tiene a su cargo.
  const session = await requirePanel({
    module: '/app/calendario',
    condominiumId: parsed.data.condominiumId,
  });
  if (!session) return { formError: SIN_PERMISO };

  await createCalendarEvent(session.user.companyId, session.user.id, {
    ...parsed.data,
    eventDate: new Date(parsed.data.eventDate),
  });

  revalidatePath('/app/calendario');
  return { success: true };
}
