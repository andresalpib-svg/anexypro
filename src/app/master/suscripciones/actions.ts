'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import {
  savePlan,
  deletePlan,
  assignPlan,
  registerPayment,
  blockCompany,
  unblockCompany,
} from '@/lib/services/subscriptions';

async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

const actor = (s: NonNullable<Awaited<ReturnType<typeof guardMaster>>>) => ({
  userId: s.user.id,
  userName: s.user.name ?? 'Master',
});

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

function refrescar() {
  revalidatePath('/master/suscripciones');
  revalidatePath('/master/empresas');
  revalidatePath('/master');
}

// ---------- Planes ----------

export async function savePlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master administra los planes.' };

  const planId = String(formData.get('planId') ?? '') || null;
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { errors: { name: ['Ponele un nombre al plan.'] } };

  /**
   * `Number('')` es 0 y `Number('abc')` es NaN, y `?? 0` no atrapa el
   * NaN (solo null/undefined): sin esto un precio con letras entraba a
   * la base como NaN y un precio negativo pasaba tal cual.
   */
  const numero = (campo: string, pordefecto: number) => {
    const n = Number(formData.get(campo) ?? pordefecto);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const price = numero('price', 0);
  const maxCondominiums = numero('maxCondominiums', 0);
  const graceDays = numero('graceDays', 5);
  const sortOrder = numero('sortOrder', 0);
  if (price === null) return { errors: { price: ['El precio debe ser un número mayor o igual a cero.'] } };
  if (maxCondominiums === null) return { errors: { maxCondominiums: ['El tope debe ser un número entero (0 = sin tope).'] } };
  if (graceDays === null) return { errors: { graceDays: ['Los días de gracia deben ser un número mayor o igual a cero.'] } };
  if (sortOrder === null) return { errors: { sortOrder: ['El orden debe ser un número mayor o igual a cero.'] } };

  try {
    await savePlan(planId, {
      name,
      description: String(formData.get('description') ?? ''),
      price,
      currency: String(formData.get('currency') ?? 'CRC'),
      period: String(formData.get('period') ?? 'mensual') as any,
      maxCondominiums,
      graceDays,
      isActive: formData.get('isActive') !== 'off',
      sortOrder,
    });
  } catch (e: any) {
    if (e?.code === 'P2002') return { errors: { name: ['Ya existe un plan con ese nombre.'] } };
    return { formError: e?.message ?? 'No se pudo guardar el plan.' };
  }
  refrescar();
  return { success: true };
}

export async function deletePlanAction(planId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await deletePlan(planId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo eliminar.' };
  }
  refrescar();
  return { ok: true };
}

// ---------- Cuenta de cada empresa ----------

export async function assignPlanAction(
  companyId: string,
  planId: string,
  primeraFecha: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  if (!planId || !primeraFecha) return { ok: false, error: 'Elegí el plan y la fecha del próximo pago.' };
  try {
    await assignPlan(actor(session), companyId, planId, new Date(`${primeraFecha}T00:00:00Z`));
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo asignar el plan.' };
  }
  refrescar();
  return { ok: true };
}

export async function registerPaymentAction(
  companyId: string,
  input: { amount?: number; method?: string; reference?: string; note?: string }
): Promise<{ ok: boolean; error?: string; periodEnd?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    const r = await registerPayment(actor(session), companyId, input);
    refrescar();
    return { ok: true, periodEnd: r.periodEnd.toISOString().slice(0, 10) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo registrar el pago.' };
  }
}

/**
 * Bloquear corta el acceso de algunos roles. **No borra información**:
 * todo queda en su sitio y vuelve a estar disponible al desbloquear o
 * al registrar el pago.
 */
export async function blockCompanyAction(
  companyId: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await blockCompany(actor(session), companyId, reason);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo bloquear.' };
  }
  refrescar();
  return { ok: true };
}

export async function unblockCompanyAction(companyId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Sin permiso.' };
  try {
    await unblockCompany(actor(session), companyId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo desbloquear.' };
  }
  refrescar();
  return { ok: true };
}
