import crypto from 'node:crypto';

/**
 * Enlaces temporales de descarga.
 *
 * POR QUÉ NO SE USA UN ENLACE FIRMADO DEL PROVEEDOR: una URL prefirmada
 * de S3 o de Google Drive revela dónde vive el archivo — el bucket, el
 * identificador, la cuenta. El requisito es que el usuario nunca
 * conozca la ubicación real, así que ANEXYpro emite un enlace hacia SU
 * PROPIA ruta y es esa ruta la que va a buscar los bytes al proveedor.
 *
 * Ventajas de hacerlo así:
 *  - La ubicación real nunca sale del servidor.
 *  - Los permisos se vuelven a verificar EN EL MOMENTO de la descarga,
 *    no solo cuando se emitió el enlace: si al usuario le quitaron el
 *    acceso hace un minuto, el enlace ya no sirve.
 *  - Cambiar de proveedor no cambia ninguna URL, porque las URLs nunca
 *    apuntaron al proveedor.
 *
 * El token es autocontenido y firmado: no hay que guardarlo en la base,
 * así que emitir un enlace no cuesta una escritura.
 */

const DEFAULT_TTL_SECONDS = 300; // 5 minutos

export type LinkPayload = {
  /** Objeto solicitado. */
  o: string;
  /** Usuario al que se le emitió. El enlace no es transferible. */
  u: string;
  /** Vencimiento, en segundos epoch. */
  e: number;
  /** 'v' para ver en el navegador, 'd' para descargar. */
  m: 'v' | 'd';
};

function secret(): string {
  // Se reutiliza el secreto de NextAuth: ya es obligatorio y ya está
  // protegido. Un secreto más que administrar es un secreto más que se
  // queda sin rotar.
  const value = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!value) {
    throw new Error('Falta NEXTAUTH_SECRET: sin él no se pueden firmar los enlaces de descarga.');
  }
  return value;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(body: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(body).digest());
}

/** Emite un enlace de corta vida para un objeto y un usuario concretos. */
export function issueLink(
  objectId: string,
  userId: string,
  opts: { ttlSeconds?: number; mode?: 'v' | 'd' } = {}
): string {
  const payload: LinkPayload = {
    o: objectId,
    u: userId,
    e: Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS),
    m: opts.mode ?? 'v',
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body)}`;
}

export type VerifyResult =
  | { ok: true; payload: LinkPayload }
  | { ok: false; reason: string };

export function verifyLink(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'El enlace no tiene el formato esperado.' };
  const [body, signature] = parts as [string, string];

  const expected = sign(body);
  // Comparación en tiempo constante: comparar con === filtra
  // información sobre la firma correcta.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'El enlace fue alterado.' };
  }

  let payload: LinkPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'El enlace está corrupto.' };
  }

  if (!payload.o || !payload.u || !payload.e) return { ok: false, reason: 'El enlace está incompleto.' };
  if (payload.e < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'El enlace venció. Volvé a abrir el documento.' };
  }

  return { ok: true, payload };
}

/** Ruta pública del enlace. Nunca apunta al proveedor. */
export function linkPath(token: string): string {
  return `/api/documentos/${token}`;
}
