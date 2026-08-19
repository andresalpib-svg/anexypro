'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel } from '@/lib/guard';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { paymentSchema } from '@/lib/validations/finance';
import { sendStatementSchema } from '@/lib/validations/account-statements';
import { makePayment } from '@/lib/services/finance';
import { sendAccountStatementEmail } from '@/lib/services/account-statements';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

/**
 * Ambas acciones repiten el mismo par de comprobaciones, a propósito
 * (mismo patrón que `finanzas/actions.ts`):
 *
 *  1. `requirePanel` — sesión + rol de panel + permiso del área
 *     `finanzas` + que el `condominiumId` del formulario esté entre
 *     los condominios asignados a quien ejecuta (el supervisor solo
 *     entra a los suyos). El módulo NO está en `CONTADOR_MODULES`,
 *     así que el contador queda fuera aquí también, no solo en el
 *     menú.
 *  2. Se vuelve a resolver el condominio REAL de la filial contra la
 *     base (`condoOfProperty`) y se compara con el `condominiumId`
 *     recibido. Un `condominiumId` oculto en el formulario se cambia
 *     desde el navegador en dos segundos — sin este segundo paso, un
 *     supervisor con acceso al Condominio A podría aplicar un pago o
 *     mandar el estado de cuenta de una filial del Condominio B con
 *     solo editar el campo oculto.
 */

export async function applyStatementPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/estados-cuenta', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await makePayment(session.user.companyId, parsed.data, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el pago.' };
  }

  revalidatePath(`/app/estados-cuenta/${parsed.data.propertyId}`);
  return { success: true };
}

export async function sendStatementEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = sendStatementSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/estados-cuenta', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await sendAccountStatementEmail(session.user.companyId, parsed.data, {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? 'Usuario',
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo enviar el correo.' };
  }

  revalidatePath(`/app/estados-cuenta/${parsed.data.propertyId}`);
  return { success: true };
}
