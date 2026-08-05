import type { Session } from 'next-auth';

/**
 * Áreas de permisos — mismas 9 del prototipo. "Junta Directiva" NO es
 * un rol: es un conjunto de boardAreas sobre una Person ya existente
 * (ver Person.isBoardMember / Person.boardAreas en schema.prisma).
 */
export const BOARD_AREAS = {
  reportes: 'Reportes',
  finanzas: 'Finanzas',
  mantenimientos: 'Mantenimientos de Áreas Comunes',
  proyectos: 'Proyectos',
  asambleas: 'Asambleas',
  documentos: 'Documentos',
  comunicados: 'Comunicados',
} as const;

export type PermissionArea =
  | keyof typeof BOARD_AREAS
  | 'seguridad'
  // Los expedientes disciplinarios llevan datos personales de vecinos
  // y fotografías: no se exponen a la Junta Directiva, igual que
  // auditoría. Por eso el área vive aquí y no en BOARD_AREAS.
  | 'incumplimientos'
  | 'contabilidad'
  | 'auditoria'
  | 'asistentesia';

/**
 * can(session, area) — misma semántica que el prototipo:
 *  - admin_owner: acceso completo siempre.
 *  - admin_staff: acceso completo EXCEPTO donde staffPermissions[area]
 *    sea explícitamente `false`. Ausente en el objeto = permitido.
 *  - seguridad / condomino: no usan este helper para el panel admin;
 *    su acceso se resuelve por el layout de su propio portal.
 *
 * NUNCA expuesto a la Junta Directiva: 'auditoria'. Ver
 * diseno-modulo-19-auditoria.md — decisión de producto explícita.
 */
/**
 * Áreas a las que llega el rol contador. Es un rol de SOLO lo
 * financiero: nunca ve residentes, visitas ni seguridad, porque un
 * contador externo no tiene por qué acceder a datos personales de los
 * condóminos.
 */
const CONTADOR_AREAS: PermissionArea[] = ['finanzas', 'contabilidad', 'reportes', 'documentos'];

export function can(session: Session | null, area: PermissionArea): boolean {
  if (!session?.user) return false;
  if (session.user.role === 'admin_owner') return true;
  if (session.user.role === 'contador') return CONTADOR_AREAS.includes(area);
  if (session.user.role === 'admin_staff') {
    const perms = session.user.staffPermissions;
    if (!perms) return true;
    return perms[area] !== false;
  }
  return false;
}

/** Junta Directiva: ¿esta persona tiene el área otorgada? */
export function boardCan(session: Session | null, area: keyof typeof BOARD_AREAS): boolean {
  if (!session?.user?.isBoardMember) return false;
  return session.user.boardAreas.includes(area);
}

/**
 * Auditoría NUNCA se otorga a la Junta Directiva bajo ninguna
 * circunstancia — ni siquiera si boardAreas la incluyera por error de
 * datos. Es información operativa interna, no un reporte de
 * transparencia hacia propietarios.
 */
export function isAuditableByBoard(): false {
  return false;
}
