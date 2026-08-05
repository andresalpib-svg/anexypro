import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

/**
 * Recuperación de contraseña desde la pantalla de acceso.
 *
 * POR QUÉ NO HAY TABLA DE TOKENS: el enlace es autocontenido y firmado,
 * igual que los de descarga (`storage-links.ts`). Pedir un enlace no
 * cuesta una escritura, y no queda nada que limpiar después.
 *
 * CÓMO SE INVALIDA AL USARLO: la firma incluye un trozo del hash ACTUAL
 * de la contraseña. En cuanto la contraseña cambia, el hash cambia, y
 * cualquier enlace emitido antes deja de verificar. Así un enlace sirve
 * una sola vez sin necesidad de recordarlo en ningún lado — y de paso,
 * si alguien pide dos, el segundo anula al primero solo cuando se usa.
 *
 * El enlace vive 30 minutos.
 */

const TTL_SEGUNDOS = 30 * 60;

type Payload = {
  /** Usuario. */
  u: string;
  /** Vencimiento, en segundos epoch. */
  e: number;
};

function secreto(): string {
  // Se reutiliza el secreto de NextAuth, igual que los enlaces de
  // descarga: un secreto más que administrar es uno más que se queda
  // sin rotar.
  const valor = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!valor) {
    throw new Error('Falta NEXTAUTH_SECRET: sin él no se pueden firmar los enlaces de recuperación.');
  }
  return valor;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** El trozo del hash que entra en la firma; no se puede revertir. */
function huellaDelHash(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

function firmar(cuerpo: string, huella: string): string {
  return b64url(crypto.createHmac('sha256', secreto()).update(`${cuerpo}.${huella}`).digest());
}

/** Emite el token para un usuario. No comprueba nada: eso es de quien llama. */
export function emitirToken(userId: string, passwordHash: string): string {
  const payload: Payload = { u: userId, e: Math.floor(Date.now() / 1000) + TTL_SEGUNDOS };
  const cuerpo = b64url(Buffer.from(JSON.stringify(payload)));
  return `${cuerpo}.${firmar(cuerpo, huellaDelHash(passwordHash))}`;
}

export type Verificacion =
  | { ok: true; userId: string; nombre: string; email: string }
  | { ok: false; motivo: 'invalido' | 'vencido' | 'usado' };

/**
 * Comprueba el token contra la base. Devuelve a quién pertenece o por
 * qué no sirve — el motivo se usa para explicarle al usuario si tiene
 * que pedir otro enlace.
 */
export async function verificarToken(token: string): Promise<Verificacion> {
  const partes = token.split('.');
  if (partes.length !== 2) return { ok: false, motivo: 'invalido' };
  const [cuerpo, firma] = partes as [string, string];

  let payload: Payload;
  try {
    payload = JSON.parse(desdeB64url(cuerpo).toString('utf8'));
  } catch {
    return { ok: false, motivo: 'invalido' };
  }
  if (!payload?.u || !payload?.e) return { ok: false, motivo: 'invalido' };
  if (payload.e < Math.floor(Date.now() / 1000)) return { ok: false, motivo: 'vencido' };

  const user = await prisma.user.findUnique({
    where: { id: payload.u },
    select: { id: true, email: true, fullName: true, passwordHash: true, status: true },
  });
  if (!user || user.status !== 'activo') return { ok: false, motivo: 'invalido' };

  const esperada = firmar(cuerpo, huellaDelHash(user.passwordHash));
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    // La firma solo deja de coincidir por dos motivos: la fabricaron
    // mal, o la contraseña ya cambió desde que se emitió el enlace.
    return { ok: false, motivo: 'usado' };
  }

  return { ok: true, userId: user.id, nombre: user.fullName, email: user.email };
}

/**
 * Fija la contraseña nueva a partir de un token válido.
 *
 * Se vuelve a verificar el token aquí, no solo al abrir la pantalla:
 * entre que se dibuja el formulario y se envía puede pasar cualquier
 * cosa, incluido que el plazo venza.
 */
export async function fijarPassword(token: string, nueva: string): Promise<{ ok: boolean; error?: string }> {
  if (nueva.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };

  const v = await verificarToken(token);
  if (!v.ok) {
    return {
      ok: false,
      error:
        v.motivo === 'vencido'
          ? 'El enlace venció. Pedí uno nuevo desde la pantalla de acceso.'
          : v.motivo === 'usado'
            ? 'Este enlace ya se usó. Pedí uno nuevo desde la pantalla de acceso.'
            : 'El enlace no es válido. Pedí uno nuevo desde la pantalla de acceso.',
    };
  }

  await prisma.user.update({
    where: { id: v.userId },
    data: { passwordHash: await bcrypt.hash(nueva, 12) },
  });
  return { ok: true };
}

/** Cuerpo del correo con el enlace. */
export function correoDeRecuperacion(nombre: string, enlace: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h2 style="font-size:1.15rem;margin:0 0 .75rem">Restablecer tu contraseña</h2>
      <p style="margin:0 0 1rem;line-height:1.55">Hola ${nombre}, recibimos una solicitud para cambiar la contraseña de tu cuenta de ANEXYpro.</p>
      <p style="margin:0 0 1.5rem;line-height:1.55">Abrí este enlace para elegir una nueva. Vence en 30 minutos y solo se puede usar una vez.</p>
      <p style="margin:0 0 1.5rem">
        <a href="${enlace}" style="display:inline-block;background:#2f5fe0;color:#fff;text-decoration:none;padding:.7rem 1.4rem;border-radius:.6rem;font-weight:600">Elegir contraseña nueva</a>
      </p>
      <p style="margin:0;font-size:.85rem;color:#64748b;line-height:1.55">Si no fuiste vos, no hace falta que hagas nada: tu contraseña actual sigue funcionando.</p>
    </div>
  `;
}
