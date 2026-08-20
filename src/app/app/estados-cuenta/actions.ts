'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel } from '@/lib/guard';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { chargePaymentSchema, sendStatementSchema } from '@/lib/validations/account-statements';
import { makePayment } from '@/lib/services/finance';
import { sendAccountStatementEmail } from '@/lib/services/account-statements';
import { saveToRepository } from '@/lib/services/file-refs';
import { pickFile } from '@/lib/upload';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

/**
 * Las tres acciones repiten el mismo par de comprobaciones, a propósito
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

/**
 * Aplica un pago a UN cobro puntual — la casilla vive en la propia
 * línea del histórico (columna "Pago"), así que el monto que se
 * escriba ahí se asigna a ESE cargo, nunca al más antiguo de la
 * filial (eso lo sigue haciendo el pago general de Finanzas →
 * Cuotas y pagos, que no cambió). `makePayment` vuelve a comprobar
 * que el cargo siga perteneciendo a esta filial y siga pendiente
 * antes de aplicar nada.
 */
export async function applyChargePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = chargePaymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/estados-cuenta', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    // El comprobante es opcional: si no se adjunta nada, el pago se
    // aplica igual (mismo comportamiento de siempre), solo que sin
    // archivo asociado.
    const receiptFile = pickFile(formData, 'receipt');
    const receiptUrl = receiptFile
      ? await saveToRepository(receiptFile, {
          kind: 'condo',
          condominiumId: parsed.data.condominiumId,
          slug: 'administracion/estados-de-cuenta',
        })
      : undefined;

    await makePayment(
      session.user.companyId,
      { ...parsed.data, receiptUrl },
      session.user.id,
      session.user.name ?? session.user.email ?? 'Usuario'
    );
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo aplicar el pago.' };
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
      companyId: session.user.companyId,
      role: session.user.role,
      personId: session.user.personId,
      isBoardMember: session.user.isBoardMember,
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo enviar el correo.' };
  }

  revalidatePath(`/app/estados-cuenta/${parsed.data.propertyId}`);
  return { success: true };
}
