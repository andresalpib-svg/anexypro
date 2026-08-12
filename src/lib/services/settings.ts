import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import bcrypt from 'bcryptjs';

export const PERMISSION_AREAS = [
  { key: 'finanzas', label: 'Finanzas' },
  // Permiso granular, no un área de módulo: registrar lecturas de agua
  // va con Finanzas; cambiar el MODO y la TARIFA se activa aparte.
  { key: 'agua_config', label: 'Configurar cobro de agua' },
  { key: 'comunicados', label: 'Comunicados' },
  { key: 'seguridad', label: 'Seguridad' },
  { key: 'incumplimientos', label: 'Gestión de Incumplimientos' },
  { key: 'mantenimientos', label: 'Mantenimientos de Áreas Comunes' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'asambleas', label: 'Asambleas' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'auditoria', label: 'Auditoría' },
];

// Áreas que sí puede tener la Junta Directiva — Auditoría queda
// deliberadamente fuera (ver src/lib/services/audit.ts).
export const BOARD_AREAS = ['reportes', 'finanzas', 'mantenimientos', 'proyectos', 'asambleas', 'documentos', 'comunicados'];

export async function listStaffUsers(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.user.findMany({
      where: { companyId, role: { in: ['admin_owner', 'admin_staff'] } },
      orderBy: { createdAt: 'asc' },
    })
  );
}

export async function inviteStaffUser(
  companyId: string,
  actorId: string,
  actorName: string,
  input: { fullName: string; email: string; tempPassword: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const passwordHash = await bcrypt.hash(input.tempPassword, 12);
    const user = await tx.user.create({
      data: { companyId, fullName: input.fullName, email: input.email, passwordHash, role: 'admin_staff', staffPermissions: {} },
    });
    await logActivity(tx, companyId, { userId: actorId, userName: actorName, module: 'Configuración', action: 'Usuario de staff creado', target: user.fullName });
    return user;
  });
}

/** Alterna un permiso específico para un usuario de staff — solo admin_owner puede hacerlo (verificado en la Server Action). */
export async function toggleStaffPermission(
  companyId: string,
  actorId: string,
  actorName: string,
  userId: string,
  area: string,
  allowed: boolean
) {
  return withTenantContext(companyId, async (tx) => {
    // `users` no lleva RLS: el aislamiento por empresa se garantiza aquí,
    // y solo sobre roles de staff (nunca master ni otros admin_owner).
    const user = await tx.user.findFirstOrThrow({
      where: { id: userId, companyId, role: { in: ['admin_staff', 'contador'] } },
    });
    const current = (user.staffPermissions as Record<string, boolean> | null) ?? {};
    const updated = { ...current, [area]: allowed };
    await tx.user.update({ where: { id: user.id }, data: { staffPermissions: updated } });
    await logActivity(tx, companyId, {
      userId: actorId,
      userName: actorName,
      module: 'Configuración',
      action: `Permiso "${area}" ${allowed ? 'otorgado' : 'revocado'}`,
      target: user.fullName,
    });
  });
}

// ---------- Contraseñas fijadas por la administración ----------

/**
 * Roles a los que el administrador principal SÍ puede fijarle la
 * contraseña. Deliberadamente fuera: `master` (no es de la empresa) y
 * otros `admin_owner` — entre pares, restablecer la contraseña del otro
 * es apoderarse de su cuenta. El propio titular cambia la suya en Mi
 * Perfil, y para lo demás está el panel del master.
 */
const ROLES_GESTIONABLES = ['admin_staff', 'contador', 'seguridad', 'condomino'] as const;

/** Usuarios de la empresa a los que se les puede fijar la contraseña. */
export async function listManageableUsers(companyId: string, query?: string) {
  const q = (query ?? '').trim();
  return withTenantContext(companyId, (tx) =>
    tx.user.findMany({
      where: {
        companyId,
        role: { in: [...ROLES_GESTIONABLES] },
        ...(q
          ? {
              OR: [
                { fullName: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, fullName: true, email: true, role: true, status: true, lastLoginAt: true },
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      take: 25,
    })
  );
}

/**
 * Fija a mano la contraseña de un usuario de la empresa.
 *
 * Es la vía para el caso corriente: alguien perdió el acceso y llama a
 * la administración. La contraseña se le entrega de viva voz y quien la
 * recibe puede cambiarla después desde su propio perfil.
 *
 * En la bitácora queda QUIÉN se la cambió a QUIÉN — nunca la
 * contraseña.
 */
export async function setUserPassword(
  companyId: string,
  actorId: string,
  actorName: string,
  userId: string,
  nueva: string
) {
  return withTenantContext(companyId, async (tx) => {
    // `users` no lleva RLS: el aislamiento por empresa y el filtro de
    // roles se garantizan aquí, no en la base.
    const user = await tx.user.findFirst({
      where: { id: userId, companyId, role: { in: [...ROLES_GESTIONABLES] } },
      select: { id: true, fullName: true },
    });
    if (!user) throw new Error('Ese usuario no existe en tu empresa o su contraseña no se gestiona desde aquí.');

    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(nueva, 12) } });
    await logActivity(tx, companyId, {
      userId: actorId,
      userName: actorName,
      module: 'Configuración',
      action: 'Contraseña fijada por la administración',
      target: user.fullName,
    });
    return user;
  });
}

export async function listBoardCandidates(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.person.findMany({
      where: { memberships: { some: { endDate: null, role: 'propietario', property: { condominiumId } } } },
      distinct: ['id'],
      orderBy: { fullName: 'asc' },
    })
  );
}

export async function toggleBoardMember(companyId: string, actorId: string, actorName: string, personId: string, isBoardMember: boolean) {
  return withTenantContext(companyId, async (tx) => {
    const person = await tx.person.update({ where: { id: personId }, data: { isBoardMember, boardAreas: isBoardMember ? undefined : [] } });
    await logActivity(tx, companyId, {
      userId: actorId,
      userName: actorName,
      module: 'Configuración',
      action: isBoardMember ? 'Miembro de Junta Directiva agregado' : 'Miembro de Junta Directiva removido',
      target: person.fullName,
    });
    return person;
  });
}

export async function toggleBoardArea(companyId: string, actorId: string, actorName: string, personId: string, area: string, allowed: boolean) {
  return withTenantContext(companyId, async (tx) => {
    const person = await tx.person.findUniqueOrThrow({ where: { id: personId } });
    const areas = new Set(person.boardAreas);
    if (allowed) areas.add(area);
    else areas.delete(area);
    await tx.person.update({ where: { id: personId }, data: { boardAreas: Array.from(areas) } });
    await logActivity(tx, companyId, {
      userId: actorId,
      userName: actorName,
      module: 'Configuración',
      action: `Área de Junta "${area}" ${allowed ? 'otorgada' : 'revocada'}`,
      target: person.fullName,
    });
  });
}
