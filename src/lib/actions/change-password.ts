'use server';

import bcrypt from 'bcryptjs';
import { auth } from '@/lib/auth';
import { prisma, withTenantContext } from '@/lib/db';

export type PasswordState = { formError?: string; success?: boolean };

/**
 * Cambio de la propia contraseña.
 *
 * Existe porque sin esto una contraseña restablecida por el master se
 * queda como definitiva: quien la recibe no tiene forma de sustituirla
 * por una suya.
 *
 * Pide la contraseña actual a propósito. Una sesión abierta y olvidada
 * en una computadora compartida no debería bastar para dejar fuera al
 * dueño de la cuenta.
 */
export async function changeMyPasswordAction(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const session = await auth();
  if (!session?.user) return { formError: 'Sesión expirada.' };

  const actual = String(formData.get('actual') ?? '');
  const nueva = String(formData.get('nueva') ?? '');
  const repetir = String(formData.get('repetir') ?? '');

  if (!actual || !nueva) return { formError: 'Completá los tres campos.' };
  if (nueva.length < 8) return { formError: 'La contraseña nueva debe tener al menos 8 caracteres.' };
  if (nueva !== repetir) return { formError: 'La contraseña nueva y su repetición no coinciden.' };
  if (nueva === actual) return { formError: 'La contraseña nueva tiene que ser distinta de la actual.' };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true, companyId: true, fullName: true },
  });
  if (!user) return { formError: 'No se encontró tu usuario.' };

  const correcta = await bcrypt.compare(actual, user.passwordHash);
  if (!correcta) return { formError: 'La contraseña actual no es correcta.' };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(nueva, 12) },
  });

  // Queda constancia del cambio, nunca de la contraseña.
  await withTenantContext(user.companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        userName: user.fullName,
        module: 'Seguridad',
        action: 'Contraseña cambiada por el propio usuario',
      },
    })
  ).catch(() => undefined);

  return { success: true };
}
