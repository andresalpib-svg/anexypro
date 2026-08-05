'use server';

import { prisma } from '@/lib/db';
import { isEmailConfigured, sendEmail, appUrl } from '@/lib/email';
import { emitirToken, correoDeRecuperacion, fijarPassword } from '@/lib/services/password-reset';

export type SolicitudState = { enviado?: boolean; error?: string };

/**
 * Pide el enlace de recuperación.
 *
 * SIEMPRE responde lo mismo, exista el correo o no. Decir "ese correo
 * no está registrado" convierte esta pantalla en un buscador de
 * cuentas: cualquiera podría averiguar quién usa el sistema sin
 * acertar una sola contraseña.
 */
export async function solicitarEnlaceAction(
  _prev: SolicitudState,
  formData: FormData
): Promise<SolicitudState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { error: 'Escribí tu correo electrónico.' };

  const respuestaNeutra: SolicitudState = { enviado: true };

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'activo' },
      select: { id: true, email: true, fullName: true, passwordHash: true },
    });
    if (!user) return respuestaNeutra;

    if (!isEmailConfigured()) {
      // Sin correo saliente no hay forma de entregar el enlace. Se dice
      // claro en vez de fingir que se envió: si no, el usuario espera un
      // correo que nunca va a llegar.
      return {
        error:
          'El envío de correos todavía no está configurado en el sistema. Pedile a la administración que restablezca tu contraseña.',
      };
    }

    const token = emitirToken(user.id, user.passwordHash);
    const enlace = `${appUrl().replace(/\/$/, '')}/restablecer/${token}`;

    await sendEmail({
      to: user.email,
      subject: 'Restablecer tu contraseña de ANEXYpro',
      html: correoDeRecuperacion(user.fullName, enlace),
    });
  } catch {
    // Tampoco se distingue un fallo de envío: mismo mensaje neutro.
    return respuestaNeutra;
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
