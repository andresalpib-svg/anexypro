'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { billingSchema, chargeSchema, paymentSchema } from '@/lib/validations/finance';
import { generateOrdinaryBilling, addManualCharge, makePayment } from '@/lib/services/finance';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

export async function generateBillingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  if (!can(session, 'finanzas')) return { formError: 'No tienes permiso para esta acción.' };
  const parsed = billingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

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
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  if (!can(session, 'finanzas')) return { formError: 'No tienes permiso para esta acción.' };
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await addManualCharge(session.user.companyId, {
    ...parsed.data,
    dueDate: new Date(parsed.data.dueDate),
  });

  revalidatePath('/app/finanzas');
  return { success: true };
}

export async function makePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };
  if (!can(session, 'finanzas')) return { formError: 'No tienes permiso para esta acción.' };
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  await makePayment(session.user.companyId, parsed.data, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');

  revalidatePath('/app/finanzas');
  return { success: true };
}
