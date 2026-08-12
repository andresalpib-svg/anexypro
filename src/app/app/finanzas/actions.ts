'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePanel, requireOwner } from '@/lib/guard';
import { canConfigureWater } from '@/lib/rbac';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { billingSchema, chargeSchema, paymentSchema } from '@/lib/validations/finance';
import {
  generateOrdinaryBilling,
  addManualCharge,
  makePayment,
  suspendPropertyServices,
  liftPropertySuspension,
} from '@/lib/services/finance';
import { saveWaterConfig, registerWaterCharge, periodStart } from '@/lib/services/water';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

const SIN_PERMISO = { formError: 'No tienes permiso para esta acción.' };

export async function generateBillingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = billingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // El condominio viene del formulario: se comprueba que sea de la
  // empresa Y que esté asignado a quien ejecuta (el supervisor solo
  // administra los suyos).
  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

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
  const parsed = chargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    // La filial debe pertenecer al condominio declarado: sin esto, un
    // condominio permitido en el campo oculto abría la puerta a cargar
    // una filial de otro.
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await addManualCharge(session.user.companyId, {
      ...parsed.data,
      dueDate: new Date(parsed.data.dueDate),
    });
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el cargo.' };
  }

  revalidatePath('/app/finanzas');
  return { success: true };
}

export async function makePaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    await makePayment(session.user.companyId, parsed.data, session.user.id, session.user.name ?? session.user.email ?? 'Usuario');
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo registrar el pago.' };
  }

  revalidatePath('/app/finanzas');
  return { success: true };
}

/**
 * Suspensión manual de servicios — solo la administración titular:
 * es la misma vara que aprobar convenios, porque ambas deciden sobre
 * el acceso de una filial a reservas, visitas y demás servicios.
 */
export async function suspendServicesAction(
  propertyId: string,
  condominiumId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner({ module: '/app/finanzas', condominiumId });
  if (!session) return { ok: false, error: 'Solo la administración suspende servicios.' };

  try {
    await suspendPropertyServices(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      { condominiumId, propertyId }
    );
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo suspender.' };
  }
  revalidatePath('/app/finanzas');
  return { ok: true };
}

export async function liftSuspensionAction(
  propertyId: string,
  condominiumId: string,
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireOwner({ module: '/app/finanzas', condominiumId });
  if (!session) return { ok: false, error: 'Solo la administración levanta suspensiones.' };

  try {
    await liftPropertySuspension(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      { condominiumId, propertyId, reason }
    );
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'No se pudo levantar la suspensión.' };
  }
  revalidatePath('/app/finanzas');
  return { ok: true };
}

// ---------- Cobro de agua potable ----------

const waterConfigSchema = z.object({
  condominiumId: z.string().uuid(),
  mode: z.enum(['sin_cobro', 'tarifa_plana', 'escalonado']),
  flatFee: z.coerce.number().min(0).default(0),
  /** Tramos como JSON: [{upToM3: number|null, pricePerM3: number}] */
  tiers: z.string().default('[]'),
});

export async function saveWaterConfigAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = waterConfigSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  // Titular siempre; supervisor solo si el administrador le activó el
  // permiso "Configurar cobro de agua" en Configuración.
  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session || !canConfigureWater(session)) return SIN_PERMISO;

  let tiers: { upToM3: number | null; pricePerM3: number }[];
  try {
    const raw = JSON.parse(parsed.data.tiers);
    if (!Array.isArray(raw)) throw new Error();
    tiers = raw.map((t: any) => ({
      upToM3: t.upToM3 === null || t.upToM3 === '' ? null : Number(t.upToM3),
      pricePerM3: Number(t.pricePerM3),
    }));
  } catch {
    return { formError: 'Los tramos de la tarifa no se pudieron leer.' };
  }

  try {
    await saveWaterConfig(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      { condominiumId: parsed.data.condominiumId, mode: parsed.data.mode, flatFee: parsed.data.flatFee, tiers }
    );
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo guardar la configuración.' };
  }
  revalidatePath('/app/finanzas');
  return { success: true };
}

const waterChargeSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Elegí el mes'),
  previousReading: z.coerce.number().min(0),
  currentReading: z.coerce.number().min(0),
});

export async function registerWaterChargeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = waterChargeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: '/app/finanzas', condominiumId: parsed.data.condominiumId });
  if (!session) return SIN_PERMISO;

  try {
    const realCondo = await condoOfProperty(session.user.companyId, parsed.data.propertyId);
    if (realCondo !== parsed.data.condominiumId) return SIN_PERMISO;

    const [year, month] = parsed.data.period.split('-').map(Number);
    await registerWaterCharge(
      session.user.companyId,
      { id: session.user.id, name: session.user.name ?? 'Usuario' },
      {
        condominiumId: parsed.data.condominiumId,
        propertyId: parsed.data.propertyId,
        period: periodStart(year!, month!),
        previousReading: parsed.data.previousReading,
        currentReading: parsed.data.currentReading,
      }
    );
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo generar el cobro de agua.' };
  }
  revalidatePath('/app/finanzas');
  return { success: true };
}
