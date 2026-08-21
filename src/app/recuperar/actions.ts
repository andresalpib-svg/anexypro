'use server';

import { headers } from 'next/headers';
import { waitUntil } from '@vercel/functions';
import { prisma } from '@/lib/db';
import { isEmailConfigured, sendEmail, appUrl } from '@/lib/email';
import { emitirToken, correoDeRecuperacion, fijarPassword } from '@/lib/services/password-reset';
import { clientIp, hitRateLimit } from '@/lib/rate-limit';
import { pareceBot, CAMPO_TRAMPA, CAMPO_RENDERIZADO } from '@/lib/bot-protection';

export type SolicitudState = { enviado?: boolean; error?: string };

/** Máximo de solicitudes por IP: frena tanto el bombardeo de correos a una víctima como el barrido de enumeración. */
const MAX_SOLICITUDES_POR_IP = 8;
const VENTANA_MINUTOS = 15;

/**
 * Pide el enlace de recuperación.
 *
 * SIEMPRE responde lo mismo, exista el correo o no, y en (casi) el
 * mismo tiempo. Decir "ese correo no está registrado" convierte esta
 * pantalla en un buscador de cuentas; hacerlo solo con el mensaje pero
 * ESPERANDO el envío del correo (una llamada de red al proveedor SMTP)
 * únicamente cuando la cuenta existe logra el mismo resultado por otra
 * vía: el tiempo de respuesta delata qué correos están registrados. Por
 * eso el envío nunca se espera en el camino de respuesta — se dispara
 * y se sigue, exista o no la cuenta.
 *
 * Además, sin ningún freno, esta pantalla también servía para (a)
 * bombardear de correos reales a una víctima con solo repetir el envío,
 * y (b) barrer una lista de correos midiendo el tiempo de respuesta con
 * cuantas peticiones hicieran falta. El freno por IP limita ambos.
 */
export async function solicitarEnlaceAction(
  _prev: SolicitudState,
  formData: FormData
): Promise<SolicitudState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { error: 'Escribí tu correo electrónico.' };

  const respuestaNeutra: SolicitudState = { enviado: true };

  // Antibot — ver src/lib/bot-protection.ts. Misma respuesta neutra que
  // el freno por IP de más abajo: nada distingue un rechazo por bot de
  // un envío real.
  if (
    pareceBot({
      honeypot: String(formData.get(CAMPO_TRAMPA) ?? ''),
      renderedAt: String(formData.get(CAMPO_RENDERIZADO) ?? ''),
    })
  ) {
    return respuestaNeutra;
  }

  const ip = clientIp(headers());
  if (ip) {
    const { allowed } = await hitRateLimit(`recuperar:${ip}`, {
      max: MAX_SOLICITUDES_POR_IP,
      windowMs: VENTANA_MINUTOS * 60_000,
    });
    // Misma respuesta neutra al frenar: no hay forma de distinguirlo
    // desde afuera de "ya se envió, revisá tu correo".
    if (!allowed) return respuestaNeutra;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'activo' },
      select: { id: true, email: true, fullName: true, passwordHash: true },
    });

    if (user && isEmailConfigured()) {
      const token = emitirToken(user.id, user.passwordHash);
      const enlace = `${appUrl().replace(/\/$/, '')}/restablecer/${token}`;
      // Deliberadamente sin `await` en el camino de respuesta: el envío
      // sigue en segundo plano y la función responde ya, para no delatar
      // por tiempo qué correos existen (ver el comentario de la función).
      //
      // Pero "sin await" NO alcanza en Vercel: en Next 14 (sin `after()`,
      // estable recién desde 15.1) una función serverless puede
      // congelarse en cuanto termina de mandar la respuesta, matando
      // cualquier promesa que siga en vuelo — el `fetch` a Resend podía
      // no llegar a completarse NUNCA, en silencio, sin que el `.catch`
      // llegara a correr ni a loguear nada. Es probablemente la causa
      // real de que el correo de recuperación no llegara (20/8). `waitUntil`
      // de `@vercel/functions` es la forma soportada de decirle a la
      // plataforma "esta promesa sigue viva aunque ya respondiste".
      waitUntil(
        sendEmail({
          to: user.email,
          subject: 'Restablecer tu contraseña de ANEXYpro',
          html: correoDeRecuperacion(user.fullName, enlace),
        }).catch((e) => {
          console.error('[recuperar] no se pudo enviar el correo de recuperación:', e);
        })
      );
    } else if (user && !isEmailConfigured()) {
      // Sin correo saliente no hay forma de entregar el enlace. Antes
      // esto se le decía al solicitante — pero solo cuando la cuenta
      // SÍ existía, lo cual delataba la cuenta tan claro como decirlo
      // directo. Se registra en el log del servidor en su lugar; el
      // job "salud" (system-health) ya avisa de esto por su cuenta.
      console.error('[recuperar] envío de correo no configurado — no se pudo generar el enlace para', user.email);
    }
  } catch {
    // No se distingue ningún fallo: mismo mensaje neutro siempre.
  }

  return respuestaNeutra;
}

export type FijarState = { ok?: boolean; error?: string };

export async function fijarPasswordAction(_prev: FijarState, formData: FormData): Promise<FijarState> {
  const token = String(formData.get('token') ?? '');
  const nueva = String(formData.get('password') ?? '');
  const repetida = String(formData.get('password2') ?? '');

  if (nueva !== repetida) return { error: 'Las dos contraseñas no coinciden.' };

  const r = await fijarPassword(token, nueva);
  return r.ok ? { ok: true } : { error: r.error };
}
