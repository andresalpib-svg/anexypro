'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import {
  logCollectionAction,
  createPaymentPlan,
  setPlanStatus,
  listActions,
} from '@/lib/services/collections';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const asDate = (s: string) => new Date(`${s}T12:00:00`);

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) return null;
  if (!(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

export async function logActionAction(input: {
  condominiumId: string;
  propertyId: string;
  actionType: string;
  channel?: string;
  notes?: string;
  debtAmount?: number;
  daysOverdue?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(input.condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  // A diferencia de `listActionsAction` (mismo archivo), esta acción no
  // cruzaba `propertyId` contra el `condominiumId` declarado — un
  // supervisor con acceso al condominio A podía registrar una gestión
  // de cobro contra una filial real del condominio B con solo mandar
  // su `propertyId` (auditoría de seguridad 2026-08-11, hallazgo #12).
  const condoReal = await condoOfProperty(session.user.companyId, input.propertyId);
  if (condoReal !== input.condominiumId) return { ok: false, error: 'La filial no pertenece a ese condominio.' };
  try {
    await logCollectionAction(session.user.companyId, { ...input, userId: session.user.id });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo registrar la gestión.' };
  }
  revalidatePath('/app/finanzas/cobranza');
  return { ok: true };
}

const planSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid({ message: 'Elegí la filial' }),
  totalDebt: z.coerce.number().positive('Indicá el monto de la deuda'),
  downPayment: z.coerce.number().min(0).default(0),
  installments: z.coerce.number().int().min(1, 'Al menos una cuota').max(60),
  startDate: z.string().min(10, 'Indicá desde cuándo aplica'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export async function createPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = planSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session || session.user.role !== 'admin_owner') {
    return { formError: 'Solo la administración aprueba convenios de pago.' };
  }
  if (parsed.data.downPayment > parsed.data.totalDebt) {
    return { errors: { downPayment: ['La prima no puede superar la deuda total.'] } };
  }

  try {
    const file = pickFile(formData, 'document');
    const documentUrl = file ? await saveToRepository(file, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'facturas/cobros' }) : undefined;
    await createPaymentPlan(session.user.companyId, session.user.id, {
      condominiumId: parsed.data.condominiumId,
      propertyId: parsed.data.propertyId,
      totalDebt: parsed.data.totalDebt,
      downPayment: parsed.data.downPayment,
      installments: parsed.data.installments,
      startDate: asDate(parsed.data.startDate),
      notes: parsed.data.notes,
      documentUrl,
      documentName: file?.name,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear el convenio.' };
  }
  revalidatePath('/app/finanzas/cobranza');
  // El arreglo de pago también se registra desde el recuadro de
  // morosidad de Cuotas y pagos.
  revalidatePath('/app/finanzas');
  return { success: true };
}

export async function setPlanStatusAction(
  planId: string,
  condominiumId: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session || session.user.role !== 'admin_owner') return { ok: false, error: 'Sin permiso.' };
  try {
    await setPlanStatus(session.user.companyId, planId, status);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo actualizar.' };
  }
  revalidatePath('/app/finanzas/cobranza');
  return { ok: true };
}

export type ActionHistoryItem = {
  id: string;
  actionType: string;
  channel: string | null;
  notes: string | null;
  debtAmount: number | null;
  daysOverdue: number | null;
  automated: boolean;
  createdAt: string;
};

/**
 * Histórico de gestión de cobranza de UNA filial — alimenta la ventana
 * de detalle. La filial se comprueba contra la base, no contra el
 * cliente: sin esto se podría leer la bitácora de otro condominio.
 */
export async function listActionsAction(
  condominiumId: string,
  propertyId: string
): Promise<{ ok: boolean; error?: string; items?: ActionHistoryItem[] }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  const realCondo = await condoOfProperty(session.user.companyId, propertyId);
  if (realCondo !== condominiumId) return { ok: false, error: 'Sin permiso.' };

  const items = await listActions(session.user.companyId, propertyId);
  return {
    ok: true,
    items: items.map((a) => ({
      id: a.id,
      actionType: a.actionType,
      channel: a.channel,
      notes: a.notes,
      debtAmount: a.debtAmount === null ? null : Number(a.debtAmount),
      daysOverdue: a.daysOverdue,
      automated: a.automated,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
