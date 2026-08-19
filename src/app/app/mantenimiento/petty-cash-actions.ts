'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requirePanel } from '@/lib/guard';
import { condoOfPettyCashExpense, condoOfPettyCashAllocation } from '@/lib/services/entity-scope';
import {
  allocatePettyCash,
  addPettyCashExpense,
  voidPettyCashExpense,
  voidPettyCashAllocation,
} from '@/lib/services/petty-cash';
import { pickFile } from '@/lib/upload';
import { saveToRepository, decodeUploadName } from '@/lib/services/file-refs';
import { isSafePng, isSafeJpeg, MAX_IMAGE_BYTES } from '@/lib/image-safety';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const money = z.coerce.number().positive('El monto debe ser mayor que cero').max(99_999_999);

const allocationSchema = z.object({
  condominiumId: z.string().uuid(),
  amount: money,
  allocatedOn: z.string().min(10, 'Indica la fecha'),
  note: z.string().max(300).optional().or(z.literal('')),
});

const expenseSchema = z.object({
  condominiumId: z.string().uuid(),
  amount: money,
  spentOn: z.string().min(10, 'Indica la fecha de la compra'),
  detail: z.string().min(3, 'Describe el gasto').max(300),
});

/** Las fechas son @db.Date: se fijan a mediodía para no correrse de día. */
const asDate = (s: string) => new Date(`${s}T12:00:00`);

/**
 * Delega en `requirePanel` en vez de reimplementarlo.
 *
 * Este archivo tenía su propio guard con la lista de roles y el
 * `canAccessCondo`, pero le faltaban dos cosas que `requirePanel` sí
 * hace: consultar la grilla de permisos (`can`) y cerrar el paso a una
 * empresa demo vencida. Revocarle Mantenimientos a un supervisor en
 * Configuración le quitaba el módulo del menú y le cerraba la
 * pantalla, pero no le cerraba estas acciones — y una Server Action es
 * un endpoint HTTP que se llama sin pasar por la pantalla (hallazgo
 * 8.2). Dos implementaciones del mismo permiso siempre terminan
 * separándose; ahora hay una sola.
 */
async function guard(condominiumId: string, opts: { ownerOnly?: boolean } = {}) {
  return requirePanel({
    area: 'mantenimientos',
    roles: opts.ownerOnly ? ['admin_owner'] : ['admin_owner', 'admin_staff'],
    condominiumId,
  });
}

/** Solo la administración define cuánto dinero tiene disponible el supervisor. */
export async function allocateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = allocationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId, { ownerOnly: true });
  if (!session) return { formError: 'Solo la administración asigna el monto de la caja chica.' };

  try {
    await allocatePettyCash(session.user.companyId, session.user.id, session.user.name ?? 'Usuario', {
      condominiumId: parsed.data.condominiumId,
      amount: parsed.data.amount,
      allocatedOn: asDate(parsed.data.allocatedOn),
      note: parsed.data.note,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo asignar el monto.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

/** El supervisor registra el gasto con su factura de respaldo. */
export async function addExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await guard(parsed.data.condominiumId);
  if (!session) return { formError: 'No tienes acceso a la caja chica de ese condominio.' };

  try {
    const file = pickFile(formData, 'invoice');
    if (!file) return { errors: { invoice: ['Adjunta el documento de la factura.'] } };
    if (file.size > MAX_IMAGE_BYTES) {
      return { errors: { invoice: ['La factura pesa demasiado. Súbela por debajo de 12 MB.'] } };
    }

    // Una imagen ilegible se rechaza aquí y no al generar el informe:
    // así el problema se ve en el momento de subirla, no meses después.
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      const buf = Buffer.from(await file.arrayBuffer());
      const ok = ext === '.png' ? isSafePng(buf) : isSafeJpeg(buf);
      if (!ok) {
        return {
          errors: { invoice: ['No se pudo leer esa imagen — está dañada o en un formato no admitido. Vuelve a exportarla o súbela en PDF.'] },
        };
      }
    }

    const invoiceUrl = await saveToRepository(file, { kind: 'condo', condominiumId: parsed.data.condominiumId, slug: 'facturas' });

    await addPettyCashExpense(session.user.companyId, session.user.id, session.user.name ?? 'Usuario', {
      condominiumId: parsed.data.condominiumId,
      spentOn: asDate(parsed.data.spentOn),
      detail: parsed.data.detail,
      amount: parsed.data.amount,
      invoiceUrl,
      invoiceName: decodeUploadName(file.name),
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo registrar el gasto.' };
  }
  revalidatePath('/app/mantenimiento');
  return { success: true };
}

/** Anula el gasto (no lo borra) y exige un motivo — ver `voidPettyCashExpense`. */
export async function voidExpenseAction(
  id: string,
  condominiumId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId);
  if (!session) return { ok: false, error: 'Sin permiso.' };

  // `guard()` solo comprobó el condominio DECLARADO por quien llama;
  // hay que comprobar también que el gasto que se va a anular sea de
  // ESE condominio — si no, un supervisor con acceso al condominio A
  // podría anular un gasto real del condominio B con solo mandar el
  // `id` ajeno mientras declara `condominiumId=A` (IDOR confirmado en
  // la auditoría del módulo de Finanzas, 2026-08-13).
  try {
    const condoReal = await condoOfPettyCashExpense(session.user.companyId, id);
    if (condoReal !== condominiumId) {
      return { ok: false, error: 'Ese gasto no pertenece a este condominio.' };
    }
  } catch {
    return { ok: false, error: 'Ese gasto no existe.' };
  }

  try {
    await voidPettyCashExpense(session.user.companyId, id, reason, {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar el gasto.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}

/** Anula la asignación (no la borra) y exige un motivo. */
export async function voidAllocationAction(
  id: string,
  condominiumId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guard(condominiumId, { ownerOnly: true });
  if (!session) return { ok: false, error: 'Solo la administración puede anular una asignación.' };

  // Mismo motivo que en `deleteExpenseAction`: el `id` de la asignación
  // podría ser de otro condominio de la misma empresa. El rol exigido
  // acá (`admin_owner`) ya ve toda la empresa, así que esto no cierra
  // una fuga entre roles — pero deja la acción consistente con el resto
  // del módulo, que siempre verifica el condominio REAL del recurso.
  try {
    const condoReal = await condoOfPettyCashAllocation(session.user.companyId, id);
    if (condoReal !== condominiumId) {
      return { ok: false, error: 'Esa asignación no pertenece a este condominio.' };
    }
  } catch {
    return { ok: false, error: 'Esa asignación no existe.' };
  }

  try {
    await voidPettyCashAllocation(session.user.companyId, id, reason, {
      id: session.user.id,
      name: session.user.name ?? 'Usuario',
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar la asignación.' };
  }
  revalidatePath('/app/mantenimiento');
  return { ok: true };
}
