'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canAccessCondo } from '@/lib/services/condominiums';
import {
  createExpense,
  approveExpense,
  voidExpense,
  payExpense,
  upsertSupplier,
} from '@/lib/services/expenses';
import { pickFile } from '@/lib/upload';
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { isSafePng, isSafeJpeg, MAX_IMAGE_BYTES } from '@/lib/image-safety';
import { parseInvoiceXml } from '@/lib/domain/invoice-xml';
import { withTenantContext } from '@/lib/db';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const money = z.coerce.number().min(0).max(999_999_999);

const expenseSchema = z.object({
  condominiumId: z.string().uuid(),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  category: z.string().min(1, 'Elegí una categoría'),
  description: z.string().min(3, 'Describí el gasto').max(300),
  invoiceNumber: z.string().max(60).optional().or(z.literal('')),
  issueDate: z.string().min(10, 'Indicá la fecha de la factura'),
  dueDate: z.string().optional().or(z.literal('')),
  subtotal: money,
  taxAmount: money.default(0),
  notes: z.string().max(500).optional().or(z.literal('')),
});

const paySchema = z.object({
  expenseId: z.string().uuid(),
  condominiumId: z.string().uuid(),
  bankAccountId: z.string().uuid().optional().or(z.literal('')),
  amount: z.coerce.number().positive('El monto debe ser mayor que cero'),
  paymentDate: z.string().min(10, 'Indicá la fecha del pago'),
  method: z.string().min(1),
  reference: z.string().max(80).optional().or(z.literal('')),
});

/** @db.Date: mediodía para que no se corra de día por zona horaria. */
const asDate = (s: string) => new Date(`${s}T12:00:00`);

async function guard(condominiumId: string) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff', 'contador'].includes(session.user.role)) return null;
  if (!(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

/** Rechaza documentos ilegibles antes de guardarlos. */
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
  const url = await saveToRepository(file, { kind: 'condo', condominiumId, slug: 'facturas' });
  return { url, name: decodeUploadName(file.name) };
}

export async function createExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tenés acceso a este condominio.' };
  if (session.user.role === 'contador') return { formError: 'El rol contador no registra gastos.' };
  if (parsed.data.subtotal <= 0) return { errors: { subtotal: ['El monto debe ser mayor que cero'] } };

  try {
    const doc = await saveDocument(formData, parsed.data.condominiumId);
    if (doc.error) return { errors: { document: [doc.error] } };

    await createExpense(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario', role: session.user.role },
      {
        condominiumId: parsed.data.condominiumId,
        supplierId: parsed.data.supplierId || undefined,
        category: parsed.data.category,
        description: parsed.data.description,
        invoiceNumber: parsed.data.invoiceNumber || undefined,
        issueDate: asDate(parsed.data.issueDate),
        dueDate: parsed.data.dueDate ? asDate(parsed.data.dueDate) : null,
        subtotal: parsed.data.subtotal,
        taxAmount: parsed.data.taxAmount,
        documentUrl: doc.url,
        documentName: doc.name,
        notes: parsed.data.notes || undefined,
      }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar el gasto.' };
  }
  revalidatePath('/app/finanzas/gastos');
  return { success: true };
}

export async function approveExpenseAction(
  expenseId: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo la administración aprueba gastos.' };
  }
  try {
    await approveExpense(session.user.companyId, expenseId, {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo aprobar.' };
  }
  revalidatePath('/app/finanzas/gastos');
  return { ok: true };
}

export async function voidExpenseAction(
  expenseId: string,
  condominiumId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo la administración anula gastos.' };
  }
  try {
    await voidExpense(session.user.companyId, expenseId, reason, {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo anular.' };
  }
  revalidatePath('/app/finanzas/gastos');
  return { ok: true };
}

export async function payExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session || session.user.role === 'contador') return { formError: 'Sin permiso.' };

  try {
    await payExpense(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      {
        expenseId: parsed.data.expenseId,
        bankAccountId: parsed.data.bankAccountId || undefined,
        amount: parsed.data.amount,
        paymentDate: asDate(parsed.data.paymentDate),
        method: parsed.data.method,
        reference: parsed.data.reference || undefined,
      }
    );
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar el pago.' };
  }
  revalidatePath('/app/finanzas/gastos');
  return { success: true };
}

const supplierSchema = z.object({
  legalName: z.string().min(2, 'Indicá el nombre del proveedor').max(150),
  tradeName: z.string().max(150).optional().or(z.literal('')),
  taxId: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
});

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) {
    return { formError: 'Sin permiso.' };
  }
  const parsed = supplierSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    await upsertSupplier(session.user.companyId, parsed.data);
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar el proveedor.' };
  }
  revalidatePath('/app/finanzas/gastos');
  return { success: true };
}


export type ReadInvoiceResult = {
  ok: boolean;
  error?: string;
  data?: {
    supplierId: string | null;
    supplierName: string | null;
    supplierTaxId: string | null;
    description: string;
    invoiceNumber: string | null;
    issueDate: string | null;
    subtotal: number | null;
    taxAmount: number | null;
    total: number | null;
    currency: string;
    suggestedCategory: string | null;
  };
};

/**
 * Lee el XML de la factura electrónica y devuelve los datos para
 * precargar el formulario.
 *
 * En Costa Rica el proveedor manda el XML aceptado por Hacienda, así
 * que este camino es EXACTO: no hay reconocimiento óptico ni margen de
 * error de lectura. Si el proveedor ya existe, se identifica por
 * cédula jurídica y se hereda su categoría habitual.
 */
export async function readInvoiceXmlAction(formData: FormData): Promise<ReadInvoiceResult> {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) {
    return { ok: false, error: 'Sin permiso.' };
  }

  const file = pickFile(formData, 'xml');
  if (!file) return { ok: false, error: 'Elegí el archivo XML.' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'El XML pesa demasiado.' };

  try {
    const text = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const parsed = parseInvoiceXml(text);
    if (!parsed) {
      return { ok: false, error: 'El archivo no parece un comprobante electrónico de Hacienda.' };
    }

    // Identificar al proveedor por cédula jurídica.
    //
    // La comparación se hace SOLO con los dígitos: en el XML de
    // Hacienda la cédula viene sin guiones ("3102654321") pero la
    // gente la digita con ellos ("3-102-654321"). Comparar los textos
    // tal cual haría que nunca coincidiera.
    let supplier: { id: string; defaultCategory: string | null } | null = null;
    if (parsed.emitterTaxId) {
      const digits = (v: string | null) => (v ?? '').replace(/\D/g, '');
      const target = digits(parsed.emitterTaxId);
      const candidates = await withTenantContext(session.user.companyId, (tx) =>
        tx.supplier.findMany({
          where: { companyId: session.user.companyId, taxId: { not: null }, isActive: true },
          select: { id: true, taxId: true, defaultCategory: true },
        })
      );
      const found = candidates.find((c) => digits(c.taxId) === target);
      supplier = found ? { id: found.id, defaultCategory: found.defaultCategory } : null;
    }

    return {
      ok: true,
      data: {
        supplierId: supplier?.id ?? null,
        supplierName: parsed.emitterName,
        supplierTaxId: parsed.emitterTaxId,
        description: parsed.summary ?? parsed.emitterName ?? 'Factura electrónica',
        invoiceNumber: parsed.consecutive,
        issueDate: parsed.issueDate ? parsed.issueDate.toISOString().slice(0, 10) : null,
        subtotal: parsed.subtotal,
        taxAmount: parsed.taxTotal,
        total: parsed.total,
        currency: parsed.currency,
        suggestedCategory: supplier?.defaultCategory ?? null,
      },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo leer el XML.' };
  }
}
