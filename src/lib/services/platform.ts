import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma, forEachCompany, withTenantContext } from '@/lib/db';
import { MARCA_POR_DEFECTO } from '@/lib/branding';

/**
 * Operaciones de plataforma — solo el usuario master.
 *
 * Dar de alta a una empresa administradora, crear a sus usuarios
 * administradores, y auxiliar a cualquier usuario del sistema cuando
 * pierde el acceso.
 *
 * `companies` y `users` no llevan Row-Level Security —el inicio de
 * sesión tiene que poder buscar por correo antes de saber de qué
 * empresa es nadie—, así que estas funciones consultan directo. Lo que
 * las protege es que solo se llaman desde acciones que exigen rol
 * master.
 */

// ============================================================
// Alta de cliente
// ============================================================

export type NuevaEmpresa = {
  legalName: string;
  tradeName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  brandPrimary?: string;
  brandDeep?: string;
  /** Primer administrador de la empresa. */
  adminFullName: string;
  adminEmail: string;
  /** Si viene vacía se genera una y se devuelve para entregarla. */
  adminPassword?: string;
};

export type AltaResultado = {
  companyId: string;
  userId: string;
  email: string;
  /** Contraseña en claro. Se muestra UNA vez y no se vuelve a saber. */
  password: string;
};

/**
 * Crea la empresa y su primer administrador en una sola transacción.
 *
 * Van juntos a propósito: una empresa sin administrador no le sirve a
 * nadie —nadie podría entrar a configurarla— y dejarla a medias
 * obligaría a recordar el segundo paso.
 */
export async function createCompanyWithAdmin(
  master: { userId: string; userName: string },
  input: NuevaEmpresa
): Promise<AltaResultado> {
  const email = input.adminEmail.trim().toLowerCase();
  const password = input.adminPassword?.trim() || generarPassword();

  const yaExiste = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (yaExiste) throw new Error(`Ya existe un usuario con el correo ${email}.`);

  const passwordHash = await bcrypt.hash(password, 12);

  const { company, user } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        legalName: input.legalName.trim(),
        tradeName: input.tradeName?.trim() || null,
        taxId: input.taxId?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        brandPrimary: input.brandPrimary?.trim() || null,
        brandDeep: input.brandDeep?.trim() || null,
      },
    });
    const user = await tx.user.create({
      data: {
        companyId: company.id,
        email,
        passwordHash,
        fullName: input.adminFullName.trim(),
        role: 'admin_owner',
        status: 'activo',
      },
    });
    return { company, user };
  });

  await registrarEnBitacora(company.id, master, 'Empresa creada', `${company.legalName} · admin ${email}`);

  return { companyId: company.id, userId: user.id, email, password };
}

/** Administrador adicional para una empresa que ya existe. */
export async function createAdminForCompany(
  master: { userId: string; userName: string },
  companyId: string,
  input: { fullName: string; email: string; password?: string }
): Promise<AltaResultado> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, legalName: true } });
  if (!company) throw new Error('La empresa no existe.');

  const email = input.email.trim().toLowerCase();
  const yaExiste = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });
  if (yaExiste) throw new Error(`Ya existe un usuario con el correo ${email}.`);

  const password = input.password?.trim() || generarPassword();
  const user = await prisma.user.create({
    data: {
      companyId,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: input.fullName.trim(),
      role: 'admin_owner',
      status: 'activo',
    },
  });

  await registrarEnBitacora(companyId, master, 'Administrador creado', `${input.fullName} · ${email}`);
  return { companyId, userId: user.id, email, password };
}

// ============================================================
// Empresas
// ============================================================

export async function listCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  });

  // Los condominios y las unidades sí llevan RLS: se cuentan empresa
  // por empresa, con su contexto.
  const conteos = await forEachCompany(async (tx) => ({
    condominios: await tx.condominium.count({ where: { deletedAt: null } }),
    unidades: await tx.property.count(),
  }));
  const porEmpresa = new Map(conteos.map((c) => [c.companyId, c.result]));

  return companies.map((c) => ({
    ...c,
    condominios: porEmpresa.get(c.id)?.condominios ?? 0,
    unidades: porEmpresa.get(c.id)?.unidades ?? 0,
  }));
}

export async function getCompany(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return null;
  const usuarios = await prisma.user.findMany({
    where: { companyId },
    orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  const conteo = await withTenantContext(companyId, async (tx) => ({
    condominios: await tx.condominium.count({ where: { deletedAt: null } }),
    unidades: await tx.property.count(),
  }));
  return { ...company, usuarios, ...conteo };
}

export type MarcaInput = {
  legalName?: string;
  tradeName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  brandPrimary?: string;
  brandDeep?: string;
  logoUrl?: string;
  status?: string;
};

export async function updateCompany(
  master: { userId: string; userName: string },
  companyId: string,
  input: MarcaInput
) {
  const company = await prisma.company.update({
    where: { id: companyId },
    data: {
      ...(input.legalName ? { legalName: input.legalName.trim() } : {}),
      ...(input.tradeName !== undefined ? { tradeName: input.tradeName?.trim() || null } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      // Vacío = vuelve a la paleta de ANEXYpro.
      ...(input.brandPrimary !== undefined ? { brandPrimary: input.brandPrimary?.trim() || null } : {}),
      ...(input.brandDeep !== undefined ? { brandDeep: input.brandDeep?.trim() || null } : {}),
      ...(input.logoUrl ? { logoUrl: input.logoUrl } : {}),
      ...(input.status ? { status: input.status as any } : {}),
    },
  });
  await registrarEnBitacora(companyId, master, 'Empresa actualizada', company.legalName);
  return company;
}

// ============================================================
// Usuarios de la plataforma
// ============================================================

export type FiltroUsuarios = { texto?: string; companyId?: string; role?: string; status?: string };

/** Buscador de usuarios de todas las empresas: es la vista del master. */
export async function listPlatformUsers(f: FiltroUsuarios = {}) {
  const q = f.texto?.trim();
  return prisma.user.findMany({
    where: {
      ...(f.companyId ? { companyId: f.companyId } : {}),
      ...(f.role ? { role: f.role as any } : {}),
      ...(f.status ? { status: f.status as any } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    take: 300,
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      company: { select: { id: true, legalName: true, tradeName: true } },
    },
  });
}

/**
 * Ficha completa de un usuario: a qué empresa pertenece, qué rol tiene,
 * cuándo entró por última vez, qué condominios supervisa y con qué
 * persona está vinculado. Es lo que hace falta para atender a alguien
 * que llama porque no puede entrar.
 */
export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, legalName: true, tradeName: true, status: true } },
    },
  });
  if (!user) return null;

  // Últimos accesos: dice si el problema es la contraseña o el usuario.
  const accesos = await withTenantContext(user.company.id, (tx) =>
    tx.authLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { eventType: true, createdAt: true },
    })
  ).catch(() => []);

  const condominios =
    user.role === 'admin_staff'
      ? await withTenantContext(user.company.id, (tx) =>
          tx.condominiumSupervisor.findMany({
            where: { userId },
            select: { condominium: { select: { name: true } } },
          })
        ).catch(() => [])
      : [];

  const persona = await withTenantContext(user.company.id, (tx) =>
    tx.person.findFirst({
      where: { userId },
      select: {
        fullName: true,
        idNumber: true,
        memberships: {
          where: { endDate: null },
          select: { role: true, property: { select: { code: true, condominium: { select: { name: true } } } } },
        },
      },
    })
  ).catch(() => null);

  return { ...user, accesos, condominios: condominios.map((c) => c.condominium.name), persona };
}

/**
 * Restablece la contraseña y devuelve la nueva en claro.
 *
 * Se devuelve para mostrarla UNA vez: mientras no haya correo saliente
 * configurado, es la única forma de que el master pueda entregársela a
 * quien la necesita. Queda registrada la gestión, nunca la contraseña.
 */
export async function resetUserPassword(
  master: { userId: string; userName: string },
  userId: string,
  nueva?: string
): Promise<{ email: string; password: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, companyId: true, role: true },
  });
  if (!user) throw new Error('El usuario no existe.');
  if (user.role === 'master') throw new Error('La contraseña del usuario master no se restablece desde aquí.');

  const password = nueva?.trim() || generarPassword();
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12), status: 'activo' },
  });

  await registrarEnBitacora(user.companyId, master, 'Contraseña restablecida', `${user.fullName} · ${user.email}`);
  return { email: user.email, password };
}

/** Bloquea o reactiva el acceso de un usuario. */
export async function setUserStatus(
  master: { userId: string; userName: string },
  userId: string,
  status: 'activo' | 'bloqueado' | 'inactivo'
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, companyId: true, role: true },
  });
  if (!user) throw new Error('El usuario no existe.');
  if (user.role === 'master') throw new Error('El usuario master no se puede bloquear a sí mismo.');

  await prisma.user.update({ where: { id: userId }, data: { status } });
  await registrarEnBitacora(
    user.companyId,
    master,
    status === 'activo' ? 'Usuario reactivado' : 'Usuario bloqueado',
    `${user.fullName} · ${user.email}`
  );
}

// ============================================================
// Utilidades
// ============================================================

/**
 * Contraseña temporal legible: sin caracteres que se confundan al
 * dictarla por teléfono (l/1/I, O/0), que es como se va a entregar.
 */
export function generarPassword(largo = 12): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const min = 'abcdefghijkmnpqrstuvwxyz';
  const num = '23456789';
  const sig = '*#$%+';
  const todo = abc + min + num + sig;
  const pick = (s: string) => s[crypto.randomInt(s.length)]!;
  // Al menos una de cada clase, para que cumpla cualquier política.
  const base = [pick(abc), pick(min), pick(num), pick(sig)];
  while (base.length < largo) base.push(pick(todo));
  // Barajado con aleatoriedad criptográfica.
  for (let i = base.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [base[i], base[j]] = [base[j]!, base[i]!];
  }
  return base.join('');
}

/** La bitácora de la empresa afectada, para que quede rastro de la gestión. */
async function registrarEnBitacora(
  companyId: string,
  master: { userId: string; userName: string },
  action: string,
  target: string
) {
  await withTenantContext(companyId, (tx) =>
    tx.auditLog.create({
      data: {
        companyId,
        userId: master.userId,
        userName: `${master.userName} (master)`,
        module: 'Plataforma',
        action,
        target,
      },
    })
  ).catch(() => undefined);
}

export { MARCA_POR_DEFECTO };
