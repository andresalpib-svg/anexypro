import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from 'next-auth';

/**
 * El guard decide quién puede ejecutar cada acción del panel. Se prueba
 * con la sesión y los condominios simulados, porque lo que interesa es
 * la regla —rol, módulo, condominio— y no la base de datos.
 */

const auth = vi.fn();
const listCondominiumsForSession = vi.fn();
const findUniqueCompany = vi.fn();

vi.mock('@/lib/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/db', () => ({ prisma: { company: { findUnique: (args: any) => findUniqueCompany(args) } } }));
vi.mock('@/lib/services/condominiums', () => ({
  listCondominiumsForSession: (s: any) => listCondominiumsForSession(s),
  canAccessCondo: async (s: any, id: string) => {
    const condos = await listCondominiumsForSession(s);
    return condos.some((c: any) => c.id === id);
  },
}));

const { requirePanel, requireOwner, requireSecurity } = await import('@/lib/guard');

function session(overrides: Partial<Session['user']>): Session {
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

beforeEach(() => {
  auth.mockReset();
  listCondominiumsForSession.mockReset();
  listCondominiumsForSession.mockResolvedValue([{ id: 'condo-propio' }]);
  findUniqueCompany.mockReset();
  // Por omisión, una empresa real y sin bloquear — así el resto de las
  // pruebas (que no les interesa la demo) no tiene que configurar esto.
  findUniqueCompany.mockResolvedValue({ isDemo: false, blockedAt: null });
});

describe('requirePanel()', () => {
  it('rechaza si no hay sesión', async () => {
    auth.mockResolvedValue(null);
    expect(await requirePanel()).toBeNull();
  });

  it('rechaza a los roles que no son del panel', async () => {
    for (const role of ['condomino', 'seguridad', 'master'] as const) {
      auth.mockResolvedValue(session({ role }));
      expect(await requirePanel()).toBeNull();
    }
  });

  it('deja pasar al supervisor en un condominio asignado', async () => {
    auth.mockResolvedValue(session({ role: 'admin_staff' }));
    const r = await requirePanel({ module: '/app/calendario', condominiumId: 'condo-propio' });
    expect(r).not.toBeNull();
  });

  it('rechaza al supervisor en un condominio que no le asignaron', async () => {
    auth.mockResolvedValue(session({ role: 'admin_staff' }));
    const r = await requirePanel({ module: '/app/calendario', condominiumId: 'condo-ajeno' });
    expect(r).toBeNull();
  });

  it('rechaza al supervisor en un área que tiene denegada', async () => {
    auth.mockResolvedValue(session({ role: 'admin_staff', staffPermissions: { finanzas: false } }));
    expect(await requirePanel({ module: '/app/finanzas' })).toBeNull();
  });

  it('reserva los módulos marcados ownerOnly al titular', async () => {
    auth.mockResolvedValue(session({ role: 'admin_staff' }));
    expect(await requirePanel({ module: '/app/configuracion' })).toBeNull();
    auth.mockResolvedValue(session({ role: 'admin_owner' }));
    expect(await requirePanel({ module: '/app/configuracion' })).not.toBeNull();
  });

  it('encierra al contador en sus módulos', async () => {
    auth.mockResolvedValue(session({ role: 'contador' }));
    expect(await requirePanel({ module: '/app/finanzas' })).not.toBeNull();
    expect(await requirePanel({ module: '/app/propiedades' })).toBeNull();
    expect(await requirePanel({ module: '/app/visitas' })).toBeNull();
  });

  // PASO 4: una demo vencida no puede "realizar operaciones" — no
  // basta con que el layout mande a la pantalla de bloqueo, porque una
  // Server Action disparada desde una pestaña ya abierta no pasa por
  // el layout.
  describe('empresa DEMO vencida', () => {
    it('rechaza cualquier acción cuando la demo está bloqueada', async () => {
      findUniqueCompany.mockResolvedValue({ isDemo: true, blockedAt: new Date('2026-08-01') });
      auth.mockResolvedValue(session({ role: 'admin_owner' }));
      expect(await requirePanel()).toBeNull();
    });

    it('deja pasar una demo TODAVÍA activa (sin blockedAt)', async () => {
      findUniqueCompany.mockResolvedValue({ isDemo: true, blockedAt: null });
      auth.mockResolvedValue(session({ role: 'admin_owner' }));
      expect(await requirePanel()).not.toBeNull();
    });

    it('una empresa REAL bloqueada (mora) NO se corta acá — eso lo sigue decidiendo el layout', async () => {
      findUniqueCompany.mockResolvedValue({ isDemo: false, blockedAt: new Date('2026-08-01') });
      auth.mockResolvedValue(session({ role: 'admin_owner' }));
      expect(await requirePanel()).not.toBeNull();
    });
  });
});

describe('requireOwner()', () => {
  it('solo admite al administrador principal', async () => {
    auth.mockResolvedValue(session({ role: 'admin_staff' }));
    expect(await requireOwner()).toBeNull();
    auth.mockResolvedValue(session({ role: 'contador' }));
    expect(await requireOwner()).toBeNull();
    auth.mockResolvedValue(session({ role: 'admin_owner' }));
    expect(await requireOwner()).not.toBeNull();
  });
});

describe('requireSecurity()', () => {
  it('solo admite al oficial de seguridad', async () => {
    auth.mockResolvedValue(session({ role: 'condomino' }));
    expect(await requireSecurity()).toBeNull();
    auth.mockResolvedValue(session({ role: 'admin_owner' }));
    expect(await requireSecurity()).toBeNull();
    auth.mockResolvedValue(session({ role: 'seguridad' }));
    expect(await requireSecurity()).not.toBeNull();
  });

  it('rechaza a la caseta de una demo vencida (a diferencia de una empresa real en mora)', async () => {
    findUniqueCompany.mockResolvedValue({ isDemo: true, blockedAt: new Date('2026-08-01') });
    auth.mockResolvedValue(session({ role: 'seguridad' }));
    expect(await requireSecurity()).toBeNull();
  });
});
