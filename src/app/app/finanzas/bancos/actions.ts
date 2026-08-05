'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import { createBankAccount } from '@/lib/services/bank-accounts';
import { parseBankStatement } from '@/lib/services/bank-import';
import {
  importBankTransactions,
  confirmMatch,
  unmatch,
  ignoreTransaction,
} from '@/lib/services/bank-reconciliation';
import { pickFile } from '@/lib/upload';
import { withTenantContext } from '@/lib/db';
import { mensajeDeError } from '@/lib/errores';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean; message?: string };

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'contador'].includes(session.user.role)) return null;
  if (!(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

const accountSchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'Ponele un nombre a la cuenta').max(80),
  bankName: z.string().min(2, 'Indicá el banco').max(80),
  accountNumber: z.string().min(3, 'Indicá el número de cuenta').max(40),
  iban: z.string().max(40).optional().or(z.literal('')),
  currency: z.string().default('CRC'),
  accountCode: z.string().min(3, 'Elegí la cuenta contable'),
  openingBalance: z.coerce.number().default(0),
  openingDate: z.string().min(10, 'Indicá la fecha de apertura'),
});

export async function createAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session || session.user.role !== 'admin_owner') {
    return { formError: 'Solo la administración crea cuentas bancarias.' };
  }

  try {
    await createBankAccount(session.user.companyId, {
      ...parsed.data,
      iban: parsed.data.iban || undefined,
      openingDate: new Date(`${parsed.data.openingDate}T12:00:00`),
    });
  } catch (e: any) {
    return { formError: mensajeDeError(e, 'No se pudo crear la cuenta.') };
  }
  revalidatePath('/app/finanzas/bancos');
  return { success: true };
}

/** Sube el estado de cuenta y concilia lo que pueda. */
export async function importStatementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const bankAccountId = String(formData.get('bankAccountId') ?? '');
  const condominiumId = String(formData.get('condominiumId') ?? '');
  if (!bankAccountId || !condominiumId) return { formError: 'Falta la cuenta bancaria.' };

  const session = await guard(condominiumId);
  if (!session) return { formError: 'Sin permiso.' };

  const file = pickFile(formData, 'statement');
  if (!file) return { errors: { statement: ['Elegí el archivo del estado de cuenta.'] } };
  if (file.size > 20 * 1024 * 1024) return { errors: { statement: ['El archivo pesa demasiado (máximo 20 MB).'] } };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const report = parseBankStatement(buffer);
    if (report.error) return { errors: { statement: [report.error] } };
    if (report.rows.length === 0) {
      return { errors: { statement: ['No se encontró ningún movimiento con fecha y monto en el archivo.'] } };
    }

    const result = await importBankTransactions(
      session.user.companyId,
      bankAccountId,
      report.rows,
      randomUUID()
    );

    const parts = [`${result.inserted} movimiento(s) nuevo(s)`];
    if (result.duplicates) parts.push(`${result.duplicates} ya estaban importados`);
    if (result.autoMatched) parts.push(`${result.autoMatched} conciliado(s) automáticamente`);
    if (result.proposed) parts.push(`${result.proposed} con propuesta`);
    if (result.manual) parts.push(`${result.manual} para revisar`);
    if (report.skipped) parts.push(`${report.skipped} línea(s) omitida(s) por no tener fecha o monto`);

    return { success: true, message: parts.join(' · ') };
  } catch (e: any) {
    return { formError: mensajeDeError(e, 'No se pudo leer el archivo.') };
  } finally {
    revalidatePath('/app/finanzas/bancos');
  }
}

export async function confirmMatchAction(
  transactionId: string,
  condominiumId: string,
  candidate: { type: string; id: string }
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await confirmMatch(session.user.companyId, transactionId, candidate, session.user.id);
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo conciliar.') };
  }
  revalidatePath('/app/finanzas/bancos');
  return { ok: true };
}

export async function unmatchAction(
  transactionId: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await unmatch(session.user.companyId, transactionId);
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo deshacer.') };
  }
  revalidatePath('/app/finanzas/bancos');
  return { ok: true };
}

export async function ignoreAction(
  transactionId: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await ignoreTransaction(session.user.companyId, transactionId);
  } catch (e: any) {
    return { ok: false, error: mensajeDeError(e, 'No se pudo ignorar.') };
  }
  revalidatePath('/app/finanzas/bancos');
  return { ok: true };
}

/**
 * Cuentas contables de activo disponibles como espejo.
 *
 * La empresa sale de la sesión. Antes llegaba por parámetro y la
 * función no pedía sesión: cualquiera podía leer el plan de cuentas de
 * cualquier empresa con solo conocer su identificador.
 */
export async function assetAccountsAction() {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'contador'].includes(session.user.role)) return [];

  return withTenantContext(session.user.companyId, (tx) =>
    tx.chartOfAccount.findMany({
      where: { companyId: session.user.companyId, type: 'activo', sub: 'corriente' },
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    })
  );
}
