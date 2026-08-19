'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePanel } from '@/lib/guard';
import { createInvestment, closeInvestment, recordInvestmentInterest } from '@/lib/services/investments';
import { pickFile } from '@/lib/upload';
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { isSafePng, isSafeJpeg, MAX_IMAGE_BYTES } from '@/lib/image-safety';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/** @db.Date: mediodía para que no se corra de día por zona horaria. */
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

async function saveDocument(
  formData: FormData,
  condominiumId: string
): Promise<{ url?: string; name?: string; error?: string }> {
  const file = pickFile(formData, 'document');
  if (!file) return {};
  if (file.size > MAX_IMAGE_BYTES) return { error: 'El documento pesa demasiado (máximo 12 MB).' };

  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    const buf = Buffer.from(await file.arrayBuffer());
    const ok = ext === '.png' ? isSafePng(buf) : isSafeJpeg(buf);
    if (!ok) return { error: 'No se pudo leer esa imagen — está dañada. Volvé a exportarla o subila en PDF.' };
  }
  const url = await saveToRepository(file, { kind: 'condo', condominiumId, slug: 'inversiones' });
  return { url, name: decodeUploadName(file.name) };
}

const investmentSchema = z.object({
  condominiumId: z.string().uuid(),
  fundId: z.string().uuid(),
  institution: z.string().min(2, 'Indicá la institución').max(120),
  investmentType: z.enum(['plazo_fijo', 'fondo_inversion', 'bono', 'certificado', 'otro']),
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  startDate: z.string().min(10, 'Indicá la fecha inicial'),
  maturityDate: z.string().optional().or(z.literal('')),
  rate: z.coerce.number().min(0).max(999),
  bankAccountId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export async function createInvestmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = investmentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    const doc = await saveDocument(formData, parsed.data.condominiumId);
    if (doc.error) return { errors: { document: [doc.error] } };

    await createInvestment(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      {
        condominiumId: parsed.data.condominiumId,
        fundId: parsed.data.fundId,
        institution: parsed.data.institution,
        investmentType: parsed.data.investmentType,
        amount: parsed.data.amount,
        startDate: asDate(parsed.data.startDate),
        maturityDate: parsed.data.maturityDate ? asDate(parsed.data.maturityDate) : null,
        rate: parsed.data.rate,
        bankAccountId: parsed.data.bankAccountId || undefined,
        documentUrl: doc.url,
        documentName: doc.name,
        notes: parsed.data.notes || undefined,
      }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar la inversión.' };
  }
  revalidatePath('/app/finanzas/inversiones');
  return { success: true };
}

const closeSchema = z.object({
  condominiumId: z.string().uuid(),
  investmentId: z.string().uuid(),
  status: z.enum(['liquidada', 'vencida', 'cancelada']),
  closeDate: z.string().min(10, 'Indicá la fecha'),
  returnAmount: z.coerce.number().min(0).optional(),
});

export async function closeInvestmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = closeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    await closeInvestment(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      {
        investmentId: parsed.data.investmentId,
        status: parsed.data.status,
        closeDate: asDate(parsed.data.closeDate),
        returnAmount: parsed.data.returnAmount,
      }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo cerrar la inversión.' };
  }
  revalidatePath('/app/finanzas/inversiones');
  return { success: true };
}

const interestSchema = z.object({
  condominiumId: z.string().uuid(),
  investmentId: z.string().uuid(),
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  date: z.string().min(10, 'Indicá la fecha'),
});

export async function recordInterestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = interestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };

  try {
    await recordInvestmentInterest(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      { investmentId: parsed.data.investmentId, amount: parsed.data.amount, date: asDate(parsed.data.date) }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar el interés.' };
  }
  revalidatePath('/app/finanzas/inversiones');
  return { success: true };
}
