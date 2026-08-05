import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma, withTenantContext } from '@/lib/db';
import { sendEmail, welcomeEmailHtml, isEmailConfigured } from '@/lib/email';
import { logActivity } from '@/lib/services/audit';

/**
 * Residentes del condominio que pueden recibir cuenta: tienen un
 * vínculo vigente con alguna unidad, tienen correo registrado y
 * todavía no tienen usuario.
 */
export async function listProvisionableResidents(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const members = await tx.propertyMember.findMany({
      where: {
        endDate: null,
        property: { condominiumId },
        person: { userId: null, email: { not: null } },
      },
      include: { person: true, property: { select: { code: true } } },
      orderBy: { person: { fullName: 'asc' } },
    });
    // Una persona puede estar en varias unidades — cuenta única.
    const seen = new Set<string>();
    return members.filter((m) => {
      if (seen.has(m.personId)) return false;
      seen.add(m.personId);
      return true;
    });
  });
}

/** Contraseña temporal legible: 12 caracteres sin ambiguos (0/O, 1/l). */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
}

export type ProvisionResult = {
  created: number;
  emailed: number;
  errors: { name: string; reason: string }[];
};

/**
 * Crea las cuentas de condómino del condominio EN CONJUNTO, solo con
 * el correo registrado de cada residente. La contraseña temporal NUNCA
 * se muestra en pantalla: viaja únicamente en el correo de bienvenida
 * (usuario + contraseña + enlace de la app). Si el correo de un
 * residente falla, su cuenta se revierte para poder reintentar después.
 */
export async function provisionCondoUsers(
  companyId: string,
  condominiumId: string,
  actor: { userId: string; userName: string }
): Promise<ProvisionResult> {
  if (!isEmailConfigured()) {
    throw new Error(
      'Para crear usuarios en conjunto primero configura el correo de la administración: RESEND_API_KEY y EMAIL_FROM en el archivo .env (ver .env.example — incluye la guía anti-spam).'
    );
  }

  const condominium = await withTenantContext(companyId, (tx) =>
    tx.condominium.findFirstOrThrow({ where: { id: condominiumId, companyId } })
  );
  const provisionable = await listProvisionableResidents(companyId, condominiumId);

  const result: ProvisionResult = { created: 0, emailed: 0, errors: [] };

  for (const member of provisionable) {
    const person = member.person;
    const email = person.email!;
    const password = generatePassword();

    let userId: string | null = null;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { companyId, email, passwordHash, fullName: person.fullName, role: 'condomino' },
      });
      userId = user.id;
      await withTenantContext(companyId, (tx) =>
        tx.person.update({ where: { id: person.id }, data: { userId: user.id } })
      );
    } catch (e: any) {
      result.errors.push({
        name: person.fullName,
        reason: e?.code === 'P2002' ? `ya existe una cuenta con el correo ${email}` : (e?.message ?? 'error al crear la cuenta'),
      });
      continue;
    }
    result.created++;

    try {
      await sendEmail({
        to: email,
        subject: `Tu acceso a ${condominium.name} — ANEXYpro`,
        html: welcomeEmailHtml({ fullName: person.fullName, email, password, condominiumName: condominium.name }),
      });
      result.emailed++;
    } catch (e: any) {
      // Sin correo entregado el residente no tiene forma de conocer su
      // contraseña — se revierte la cuenta para reintentar luego.
      await withTenantContext(companyId, (tx) =>
        tx.person.update({ where: { id: person.id }, data: { userId: null } })
      ).catch(() => {});
      if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      result.created--;
      result.errors.push({ name: person.fullName, reason: `el correo no se pudo enviar: ${e?.message ?? 'error'}` });
    }
  }

  await withTenantContext(companyId, (tx) =>
    logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Residentes',
      action: 'Usuarios de condóminos creados',
      target: `${condominium.name}: ${result.created} cuenta(s), ${result.emailed} correo(s)`,
    })
  );

  return result;
}

/**
 * Crea el usuario de acceso de una persona con contraseña definida por
 * la administración (alta manual desde "Agregar persona").
 */
export async function createUserForPerson(
  companyId: string,
  personId: string,
  input: { email: string; password: string; fullName: string }
) {
  const bcryptMod = await import('bcryptjs');
  const passwordHash = await bcryptMod.default.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { companyId, email: input.email, passwordHash, fullName: input.fullName, role: 'condomino' },
  });
  await withTenantContext(companyId, (tx) =>
    tx.person.update({ where: { id: personId }, data: { userId: user.id } })
  );
  return user;
}
