'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import {
  logCollectionAction,
  createPaymentPlan,
  setPlanStatus,
} from '@/lib/services/collections';
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
