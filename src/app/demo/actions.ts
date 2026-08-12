'use server';

import { headers } from 'next/headers';
import { createDemoCompany, type DemoCredential } from '@/lib/services/demo';
import { clientIp, hitRateLimit } from '@/lib/rate-limit';

export type CrearDemoResultado =
  | { ok: true; expiresAt: string; credentials: DemoCredential[] }
  | { ok: false; error: string };

/** Tope por IP, aparte del tope global de `createDemoCompany` — cierra la puerta a que una sola IP agote el cupo de la hora ella sola. */
const MAX_DEMOS_POR_IP = 3;
const VENTANA_MINUTOS = 60;

/**
 * Crea una empresa demo nueva, aislada y con datos ya cargados.
 *
 * Sin sesión a propósito: es la puerta pública de /demo — no hay nada
 * que borrar ni ningún dato de un cliente real al que esta acción
 * pueda llegar. La protección contra abuso tiene dos capas: el tope
 * por IP de acá (rápido, evita que una sola IP agote el cupo global) y
 * el tope global por hora, ahora atómico, dentro de `createDemoCompany`.
 */
export async function crearDemoAction(): Promise<CrearDemoResultado> {
  const ip = clientIp(headers());
  if (ip) {
    const { allowed } = await hitRateLimit(`demo:${ip}`, { max: MAX_DEMOS_POR_IP, windowMs: VENTANA_MINUTOS * 60_000 });
    if (!allowed) {
      return { ok: false, error: 'Ya creaste varias demos desde acá. Probá de nuevo más tarde.' };
    }
  }

  try {
    const r = await createDemoCompany();
    return { ok: true, expiresAt: r.expiresAt.toISOString(), credentials: r.credentials };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo crear la demo. Intentá de nuevo en un momento.' };
  }
}
