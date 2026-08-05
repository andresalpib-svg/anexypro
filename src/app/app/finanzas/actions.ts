'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel } from '@/lib/guard';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { billingSchema, chargeSchema, paymentSchema } from '@/lib/validations/finance';
import { generateOrdinaryBilling, addManualCharge, makePayment } from '@/lib/services/finance';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

export async function generateBillingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = billingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // El condominio viene del formulario: se comprueba que sea de la
  // empresa Y que esté asignado a quien ejecuta (el supervisor solo
  // administra los suyos).
  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const period = new Date(`${parsed.data.period}-01T00:00:00`);
    const r = await generateOrdinaryBilling(session.user.companyId, parsed.data.condominiumId, period);
    if (!r.created) {
      return { formError: 'La cuota de ese período ya fue emitida. No se generó de nuevo.' };
    }
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return { formError: 'Ya existe una corrida ordinaria para ese período en este condominio — las corridas son idempotentes.' };
    }
    return { formError: err?.message ?? 'No se pudo generar la facturación.' };
  }

  revalidatePath('/app/finanzas');
  return { success: true };
}

export async function addChargeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    // La filial debe pertenecer al condominio declarado: sin esto, un
    // condominio permitido en el campo oculto abría la puerta a cargar
    // una filial de otro.
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await addManualCharge(session.user.companyId, {
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el cargo.' };
  }

  revalidatePath('/app/finanzas');
  return { success: true };
}

export async function makePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await makePayment(session.user.companyId, parsed.data, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el pago.' };
  }

  revalidatePath('/app/finanzas');
  return { success: true };
}
