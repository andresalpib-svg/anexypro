'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import {
  upsertRecurring,
  deleteRecurring,
  upsertContract,
  deleteContract,
} from '@/lib/services/recurring';
import { pickFile } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const asDate = (s: string) => new Date(`${s}T12:00:00`);

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin_owner') return null;
  if (!(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

const recurringSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  condominiumId: z.string().uuid(),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().min(3, 'Describí el gasto recurrente').max(200),
  category: z.string().min(1),
  amount: z.coerce.number().min(0).max(999_999_999),
  frequency: z.enum(['mensual', 'bimensual', 'trimestral', 'semestral', 'anual']),
  dayOfMonth: z.coerce.number().int().min(1).max(31),
  leadDays: z.coerce.number().int().min(0).max(60),
  startDate: z.string().min(10, 'Indicá desde cuándo aplica'),
  endDate: z.string().optional().or(z.literal('')),
  isActive: z.coerce.boolean().default(true),
});

export async function saveRecurringAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = recurringSchema.safeParse({ ...raw, isActive: raw.isActive === 'on' || raw.isActive === 'true' });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'Solo la administración configura gastos recurrentes.' };

  try {
    await upsertRecurring(session.user.companyId, {
      id: parsed.data.id || undefined,
      condominiumId: parsed.data.condominiumId,
      supplierId: parsed.data.supplierId || undefined,
      description: parsed.data.description,
      category: parsed.data.category,
      amount: parsed.data.amount,
      frequency: parsed.data.frequency,
      dayOfMonth: parsed.data.dayOfMonth,
      leadDays: parsed.data.leadDays,
      startDate: asDate(parsed.data.startDate),
      endDate: parsed.data.endDate ? asDate(parsed.data.endDate) : null,
      isActive: parsed.data.isActive,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar.' };
  }
  revalidatePath('/app/finanzas/recurrentes');
  return { success: true };
}

export async function deleteRecurringAction(
  id: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deleteRecurring(session.user.companyId, id);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar.' };
  }
  revalidatePath('/app/finanzas/recurrentes');
  return { ok: true };
}

const contractSchema = z.object({
  id: z.string().uuid().optional().or(z.literal('')),
  condominiumId: z.string().uuid(),
  supplierId: z.string().uuid({ message: 'Elegí el proveedor' }),
  title: z.string().min(3, 'Ponele un título al contrato').max(150),
  serviceType: z.string().min(2, 'Indicá el tipo de servicio').max(80),
  startDate: z.string().min(10, 'Indicá la fecha de inicio'),
  endDate: z.string().min(10, 'Indicá la fecha de vencimiento'),
  monthlyAmount: z.coerce.number().min(0).optional(),
  autoRenew: z.coerce.boolean().default(false),
  noticeDays: z.coerce.number().int().min(0).max(365),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export async function saveContractAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = contractSchema.safeParse({ ...raw, autoRenew: raw.autoRenew === 'on' || raw.autoRenew === 'true' });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'Solo la administración registra contratos.' };

  const start = asDate(parsed.data.startDate);
  const end = asDate(parsed.data.endDate);
  if (end <= start) return { errors: { endDate: ['El vencimiento debe ser posterior al inicio.'] } };

  try {
    const file = pickFile(formData, 'document');
    const documentUrl = file ? await saveToRepository(file, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'contratos/proveedores' }) : undefined;

    await upsertContract(session.user.companyId, {
      id: parsed.data.id || undefined,
      condominiumId: parsed.data.condominiumId,
      supplierId: parsed.data.supplierId,
      title: parsed.data.title,
      serviceType: parsed.data.serviceType,
      startDate: start,
      endDate: end,
      monthlyAmount: parsed.data.monthlyAmount ?? null,
      autoRenew: parsed.data.autoRenew,
      noticeDays: parsed.data.noticeDays,
      documentUrl,
      documentName: file?.name,
      notes: parsed.data.notes,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar el contrato.' };
  }
  revalidatePath('/app/finanzas/recurrentes');
  return { success: true };
}

export async function deleteContractAction(
  id: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deleteContract(session.user.companyId, id);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar.' };
  }
  revalidatePath('/app/finanzas/recurrentes');
  return { ok: true };
}
