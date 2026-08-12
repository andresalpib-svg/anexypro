'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  createMasterDemoCompany,
  reactivateDemo,
  convertDemoToFormal,
  getDemoDetail,
  getDemoHistory,
  updateDemoCommercialNotes,
  type MasterDemoResult,
  type ConvertirDemoResultado,
  type DemoSummary,
  type DemoHistoryRow,
} from '@/lib/services/demo';
import { purgeDemoDriveFiles, type PurgeDemoResult } from '@/lib/services/demo-cleanup';

/** Todo lo de este archivo es de plataforma: solo el usuario master. */
async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

export type CrearDemoState = {
  errors?: Record<string, string[]>;
  formError?: string;
  success?: boolean;
  resultado?: MasterDemoResult;
};

const demoSchema = z.object({
  clientName: z.string().min(3, 'Indicá el nombre del cliente o prospecto').max(120),
  contactEmail: z.string().email('Correo inválido'),
  phone: z.string().max(40).optional().or(z.literal('')),
  condoName: z.string().min(3, 'Indicá el nombre del condominio').max(120),
  initialUserFullName: z.string().min(3, 'Indicá el nombre del usuario inicial').max(120),
});

export async function crearUsuarioDemoAction(_prev: CrearDemoState, formData: FormData): Promise<CrearDemoState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master crea cuentas demo.' };

  const parsed = demoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    const resultado = await createMasterDemoCompany(
      { userId: session.user.id, userName: session.user.name ?? 'Master' },
      {
        clientName: parsed.data.clientName,
        contactEmail: parsed.data.contactEmail,
        phone: parsed.data.phone || undefined,
        condoName: parsed.data.condoName,
        initialUserFullName: parsed.data.initialUserFullName,
      }
    );
    revalidatePath('/master/usuarios-demo');
    return { success: true, resultado };
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear la cuenta demo.' };
  }
}

export type ReactivarState = { ok: boolean; error?: string };

/**
 * "Reactivar demo" (PASO 5) — exclusiva del master.
 *
 * VALIDACIÓN EN BACKEND: `guardMaster()` exige `role === 'master'` acá
 * mismo, sin confiar en que el botón esté oculto en el frontend — el
 * mismo criterio que el resto del panel ("el middleware protege la
 * PANTALLA, no la ACTION"). Un usuario de la propia demo (siempre
 * `admin_owner`/`admin_staff`/`seguridad`/`condomino`, NUNCA
 * `master` — hay un único master en toda la plataforma, forzado por
 * índice único en la base) no puede llamar a esta acción y
 * reactivarse a sí mismo: el rol lo impide, no una lista de
 * excepciones. `reactivateDemo` (services/demo.ts) revalida además que
 * la empresa exista y esté en `DEMO_VENCIDO` — por si algún día esta
 * acción se invoca desde otro lado sin pasar por el formulario.
 */
export async function reactivarDemoAction(companyId: string): Promise<ReactivarState> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master puede reactivar una demo.' };

  try {
    await reactivateDemo(companyId, { userId: session.user.id, userName: session.user.name ?? 'Master' });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo reactivar la demo.' };
  }
  revalidatePath('/master/usuarios-demo');
  return { ok: true };
}

export type ConvertirState =
  | { ok: true; resultado: ConvertirDemoResultado }
  | { ok: false; error: string };

/**
 * "Convertir a cuenta formal" (PASO 6) — exclusiva del master.
 *
 * Misma doble validación que "Reactivar demo": `guardMaster()` corta
 * el paso en el BACKEND así el botón nunca se hubiera ocultado en el
 * frontend, y `convertDemoToFormal` (services/demo.ts) revalida que la
 * empresa sea una demo y esté `DEMO_ACTIVO`/`DEMO_VENCIDO` — nunca se
 * "reconvierte" una que ya es formal ni se inventa una a partir de una
 * empresa que nunca fue demo.
 */
export async function convertirDemoAction(
  companyId: string,
  planId: string,
  primeraFecha: string
): Promise<ConvertirState> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master convierte una demo a cuenta formal.' };
  if (!planId || !primeraFecha) return { ok: false, error: 'Elegí el plan contratado y la fecha del próximo pago.' };

  try {
    const resultado = await convertDemoToFormal(
      companyId,
      { userId: session.user.id, userName: session.user.name ?? 'Master' },
      { planId, firstPaymentDate: new Date(`${primeraFecha}T00:00:00Z`) }
    );
    revalidatePath('/master/usuarios-demo');
    revalidatePath('/master/empresas');
    revalidatePath('/master/suscripciones');
    return { ok: true, resultado };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo convertir la demo.' };
  }
}

export type PurgarState = { ok: true; resultado: PurgeDemoResult } | { ok: false; error: string };

/**
 * "Purgar archivos" (PASO 9) — exclusiva del master, e invocada SIEMPRE
 * a mano desde este botón: no existe ningún disparador automático
 * todavía (`purgeDemoDriveFiles` no está registrada en
 * `jobs/index.ts` a propósito — ver el comentario ahí).
 *
 * Misma doble validación que el resto de este archivo: `guardMaster()`
 * corta el paso en el BACKEND, y `purgeDemoDriveFiles`
 * (services/demo-cleanup.ts) revalida por su cuenta que la empresa sea
 * una demo VENCIDA (o con una limpieza fallida previa) y que ya pasó
 * el día 18 — nunca confía en que quien llama ya lo comprobó.
 */
export async function purgarDemoAction(companyId: string): Promise<PurgarState> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master purga los archivos de una demo.' };

  try {
    const resultado = await purgeDemoDriveFiles(companyId, {
      actor: { userId: session.user.id, userName: session.user.name ?? 'Master' },
    });
    revalidatePath('/master/usuarios-demo');
    return { ok: true, resultado };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo purgar la demo.' };
  }
}

export type HistorialDemoState =
  | { ok: true; resumen: DemoSummary; historial: DemoHistoryRow[] }
  | { ok: false; error: string };

/**
 * "Ver historial" (PASO 11) — el historial comercial permanente,
 * disponible para el master pase lo que pase con la demo: activa,
 * vencida, convertida o ya eliminada. `getDemoDetail`/`getDemoHistory`
 * (services/demo.ts) filtran por `demoStatus`, no por `isDemo`, así que
 * ni la conversión ni la purga de PASO 9 hacen que esta cuenta
 * desaparezca de acá.
 */
export async function obtenerHistorialDemoAction(companyId: string): Promise<HistorialDemoState> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master ve el historial comercial de una demo.' };

  const resumen = await getDemoDetail(companyId);
  if (!resumen) return { ok: false, error: 'Esa empresa nunca fue una demo.' };
  const historial = await getDemoHistory(companyId);
  return { ok: true, resumen, historial };
}

export type NotasComercialesState = { ok: boolean; error?: string };

/**
 * Guarda las observaciones comerciales — el único campo del historial
 * permanente editable después de escrito (ver `updateDemoCommercialNotes`).
 */
export async function guardarNotasComercialesAction(companyId: string, notas: string): Promise<NotasComercialesState> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master edita las observaciones comerciales.' };

  try {
    await updateDemoCommercialNotes(companyId, notas);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudieron guardar las observaciones.' };
  }
  revalidatePath('/master/usuarios-demo');
  return { ok: true };
}
