'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import { upsertReserveFund, addReserveMovement, deleteReserveMovement } from '@/lib/services/reserve-fund';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const asDate = (s: string) => new Date(`${s}T12:00:00`);

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin_owner') return null;
  if (!(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

const fundSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'Ponele un nombre al fondo').max(80),
  targetAmount: z.coerce.number().min(0).optional(),
  monthlyQuota: z.coerce.number().min(0).default(0),
});

export async function saveFundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'Solo la administración configura el fondo de reserva.' };

  try {
    await upsertReserveFund(session.user.companyId, {
      id: parsed.data.id || undefined,
      condominiumId: parsed.data.condominiumId,
      name: parsed.data.name,
      targetAmount: parsed.data.targetAmount || null,
      monthlyQuota: parsed.data.monthlyQuota,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar el fondo.' };
  }
  revalidatePath('/app/finanzas/presupuesto');
  return { success: true };
}

const movSchema = z.object({
  condominiumId: z.string().uuid(),
  fundId: z.string().uuid(),
  movType: z.enum(['aporte', 'uso']),
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  movDate: z.string().min(10, 'Indicá la fecha'),
  description: z.string().min(3, 'Describí el movimiento').max(200),
  reference: z.string().max(120).optional().or(z.literal('')),
});

export async function addMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = movSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'Solo la administración mueve el fondo de reserva.' };

  // Un USO exige respaldo: es dinero que los propietarios apartaron
  // para un fin concreto y la asamblea va a preguntar por él.
  if (parsed.data.movType === 'uso' && !parsed.data.reference) {
    return { errors: { reference: ['Indicá el acuerdo de asamblea o documento que respalda el uso.'] } };
  }

  try {
    await addReserveMovement(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      {
        fundId: parsed.data.fundId,
        movType: parsed.data.movType,
        amount: parsed.data.amount,
        movDate: asDate(parsed.data.movDate),
        description: parsed.data.description,
        reference: parsed.data.reference || undefined,
      }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar el movimiento.' };
  }
  revalidatePath('/app/finanzas/presupuesto');
  return { success: true };
}

export async function deleteMovementAction(
  id: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deleteReserveMovement(session.user.companyId, id);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar.' };
  }
  revalidatePath('/app/finanzas/presupuesto');
  return { ok: true };
}
