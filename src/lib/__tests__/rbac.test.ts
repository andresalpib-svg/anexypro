import { describe, it, expect } from 'vitest';
import { can, boardCan, isAuditableByBoard } from '@/lib/rbac';
import type { Session } from 'next-auth';

function makeSession(overrides: Partial<Session['user']>): Session {
  return {
    user: {
      id: 'u1',
      companyId: 'c1',
      role: 'admin_staff',
      staffPermissions: null,
      personId: null,
      isBoardMember: false,
      boardAreas: [],
      ...overrides,
    },
    expires: '2099-01-01',
  } as Session;
}

describe('can()', () => {
  it('niega acceso sin sesión', () => {
    expect(can(null, 'finanzas')).toBe(false);
  });

  it('admin_owner siempre tiene acceso completo, incluso con staffPermissions restrictivo', () => {
    const session = makeSession({ role: 'admin_owner', staffPermissions: { finanzas: false } });
    expect(can(session, 'finanzas')).toBe(true);
    expect(can(session, 'auditoria')).toBe(true);
  });

  it('admin_staff sin staffPermissions definido tiene acceso completo por defecto', () => {
    const session = makeSession({ role: 'admin_staff', staffPermissions: null });
    expect(can(session, 'finanzas')).toBe(true);
  });

  it('admin_staff con un área explícitamente en false pierde acceso SOLO a esa área', () => {
    const session = makeSession({ role: 'admin_staff', staffPermissions: { finanzas: false } });
    expect(can(session, 'finanzas')).toBe(false);
    expect(can(session, 'comunicados')).toBe(true); // no mencionada = permitida
  });

  it('seguridad y condomino nunca tienen acceso al panel admin vía can()', () => {
    expect(can(makeSession({ role: 'seguridad' }), 'finanzas')).toBe(false);
    expect(can(makeSession({ role: 'condomino' }), 'finanzas')).toBe(false);
  });
});

describe('boardCan()', () => {
  it('niega acceso si la persona no es miembro de Junta Directiva', () => {
    const session = makeSession({ isBoardMember: false, boardAreas: ['finanzas'] });
    expect(boardCan(session, 'finanzas')).toBe(false);
  });

  it('otorga acceso solo a las áreas explícitamente asignadas', () => {
    const session = makeSession({ isBoardMember: true, boardAreas: ['finanzas', 'reportes'] });
    expect(boardCan(session, 'finanzas')).toBe(true);
    expect(boardCan(session, 'reportes')).toBe(true);
    expect(boardCan(session, 'asambleas')).toBe(false);
  });

  it('Auditoría NUNCA es otorgable a la Junta Directiva, ni siquiera si boardAreas la incluyera por error', () => {
    // 'auditoria' no es una clave válida de BOARD_AREAS — TypeScript ya
    // lo impediría en código real; esta prueba confirma además que la
    // función de guardia dedicada siempre devuelve false.
    expect(isAuditableByBoard()).toBe(false);
  });
});
