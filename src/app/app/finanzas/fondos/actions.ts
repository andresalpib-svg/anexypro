'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePanel } from '@/lib/guard';
import { upsertFund, addFundMovement, voidFundMovement, USER_MOVEMENT_TYPES } from '@/lib/services/funds';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const asDate = (s: string) => new Date(`${s}T12:00:00`);

/**
 * Delega en `requirePanel` en vez de reimplementarlo.
 *
 * Este archivo tenía su propio guard con la lista de roles y el
 * `canAccessCondo`, pero le faltaban dos cosas que `requirePanel` sí
 * hace: consultar la grilla de permisos (`can`) y cerrar el paso a una
 * empresa demo vencida. Revocarle Finanzas a un supervisor en
 * Configuración le quitaba el módulo del menú y le cerraba la
 * pantalla, pero no le cerraba estas acciones — y una Server Action es
 * un endpoint HTTP que se llama sin pasar por la pantalla (hallazgo
 * 8.2). Dos implementaciones del mismo permiso siempre terminan
 * separándose; ahora hay una sola.
 */
async function guard(condominiumId: string) {
  return requirePanel({ area: 'finanzas', roles: ['admin_owner', 'admin_staff'], condominiumId });
}

const fundSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  condominiumId: z.string().uuid(),
  type: z.enum(['operativo', 'reserva', 'especial', 'proyecto', 'otro']),
  name: z.string().min(2, 'Ponele un nombre al fondo').max(80),
  targetAmount: z.coerce.number().min(0).optional(),
  monthlyQuota: z.coerce.number().min(0).default(0),
  accountCode: z.string().min(1, 'Elegí la cuenta contable espejo'),
  projectId: z.string().uuid().optional().or(z.literal('')),
});

export async function saveFundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = fundSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    await upsertFund(session.user.companyId, {
      id: parsed.data.id || undefined,
      condominiumId: parsed.data.condominiumId,
      type: parsed.data.type,
      name: parsed.data.name,
      targetAmount: parsed.data.targetAmount || null,
      monthlyQuota: parsed.data.monthlyQuota,
      accountCode: parsed.data.accountCode,
      projectId: parsed.data.type === 'proyecto' ? parsed.data.projectId || null : null,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar el fondo.' };
  }
  revalidatePath('/app/finanzas/fondos');
  return { success: true };
}

const movSchema = z.object({
  condominiumId: z.string().uuid(),
  fundId: z.string().uuid(),
  movType: z.enum(USER_MOVEMENT_TYPES),
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  movDate: z.string().min(10, 'Indicá la fecha'),
  description: z.string().min(3, 'Describí el movimiento').max(200),
  reference: z.string().max(120).optional().or(z.literal('')),
});

export async function addMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = movSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  // Un uso o un compromiso exige respaldo: es dinero que se apartó o
  // gastó para un fin concreto y la asamblea puede preguntar por él.
  if ((parsed.data.movType === 'uso' || parsed.data.movType === 'compromiso') && !parsed.data.reference) {
    return { errors: { reference: ['Indicá el acuerdo de asamblea o documento que respalda el movimiento.'] } };
  }

  try {
    await addFundMovement(
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
  revalidatePath('/app/finanzas/fondos');
  return { success: true };
}

/** Anula el movimiento (no lo borra) y exige un motivo — ver `voidFundMovement`. */
export async function voidMovementAction(
  id: string,
  condominiumId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await voidFundMovement(session.user.companyId, id, reason, {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo anular.' };
  }
  revalidatePath('/app/finanzas/fondos');
  return { ok: true };
}
