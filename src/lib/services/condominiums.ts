import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import type { CondominiumInput } from '@/lib/validations/condominium';

export async function listCondominiums(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.condominium.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { properties: true } },
      },
    })
  );
}

/**
 * Condominios que el usuario de la sesión puede ver y actualizar.
 *
 * El supervisor (admin_staff) NO administra toda la empresa: solo los
 * condominios que la administración le asignó en Gestión de
 * Condominios. Todo selector de condominio del panel debe usar esta
 * función y no `listCondominiums`, o el supervisor terminaría
 * actualizando información de un condominio que no le corresponde.
 */
export async function listCondominiumsForSession(session: {
  user: { id: string; companyId: string; role: string };
}) {
  const all = await listCondominiums(session.user.companyId);
  if (session.user.role !== 'admin_staff') return all;

  const assigned = await withTenantContext(session.user.companyId, (tx) =>
    tx.condominiumSupervisor.findMany({
      where: { userId: session.user.id },
      select: { condominiumId: true },
    })
  );
  const ids = new Set(assigned.map((a) => a.condominiumId));
  return all.filter((c) => ids.has(c.id));
}

/** ¿Este usuario tiene acceso a este condominio? Guarda de servidor. */
export async function canAccessCondo(
  session: { user: { id: string; companyId: string; role: string } },
  condominiumId: string
): Promise<boolean> {
  const condos = await listCondominiumsForSession(session);
  return condos.some((c) => c.id === condominiumId);
}

export async function getCondominium(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) =>
    tx.condominium.findFirst({
      where: { id, deletedAt: null },
      include: {
        financialSettings: true,
        structuralUnits: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { properties: true } },
      },
    })
  );
}

// Crea el condominio Y sus parámetros financieros (1:1) en una sola
// transacción — nunca queda un condominio sin CondominiumFinancialSettings,
// igual que el prototipo siempre inicializaba c.fin al crear un condo.
export async function createCondominium(
  companyId: string,
  userId: string,
  userName: string,
  input: CondominiumInput
) {
  const created = await withTenantContext(companyId, async (tx) => {
    const condo = await tx.condominium.create({
      data: {
        companyId,
        name: input.name,
        code: input.code,
        type: input.type,
        addressLine: input.addressLine || null,
        province: input.province || null,
        canton: input.canton || null,
        district: input.district || null,
        currency: input.currency,
        notes: input.notes || null,
        status: 'configuracion', // siempre nace en configuración — igual que el prototipo
        createdById: userId,
        financialSettings: {
          create: {
            baseFee: input.baseFee,
            dueDay: input.dueDay,
            suspensionMonths: input.suspensionMonths,
          },
        },
      },
      include: { financialSettings: true },
    });
    await logActivity(tx, companyId, { userId, userName, module: 'Condominios', action: 'Condominio creado', target: condo.name });
    return condo;
  });

  // Repositorio de documentos: se crea el árbol de carpetas del
  // condominio en el proveedor activo.
  //
  // FUERA de la transacción y sin propagar el error a propósito: si el
  // proveedor de almacenamiento está caído o mal configurado, eso NO
  // debe impedir crear el condominio. El árbol se puede reconstruir
  // después desde el repositorio, porque `ensureCondoTree` es
  // idempotente.
  try {
    const { ensureCondoTree } = await import('@/lib/services/storage');
    await ensureCondoTree(companyId, created.id);
  } catch (e) {
    console.error(
      `[storage] No se pudo crear el árbol de carpetas de "${created.name}". Se puede reconstruir desde Documentos.`,
      e
    );
  }

  return created;
}

export async function activateCondominium(companyId: string, id: string) {
  // `companyId` también en el filtro: RLS ya aísla por empresa, pero la
  // capa de aplicación no depende solo de la red de seguridad.
  return withTenantContext(companyId, (tx) =>
    tx.condominium.updateMany({ where: { id, companyId }, data: { status: 'activo' } })
  );
}

// ---------- Supervisores asignados (máximo 5 por condominio) ----------
export const MAX_SUPERVISORS = 5;

export async function listSupervisors(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.condominiumSupervisor.findMany({
      where: { condominiumId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
  );
}

export async function assignSupervisor(companyId: string, condominiumId: string, userId: string) {
  return withTenantContext(companyId, async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, companyId, role: { in: ['admin_staff', 'admin_owner'] } } });
    if (!user) throw new Error('El usuario seleccionado no es parte del equipo de la administradora.');
    const count = await tx.condominiumSupervisor.count({ where: { condominiumId } });
    if (count >= MAX_SUPERVISORS) {
      throw new Error(`Máximo ${MAX_SUPERVISORS} supervisores por condominio — da de baja a uno antes de asignar otro.`);
    }
    return tx.condominiumSupervisor.create({ data: { condominiumId, userId } });
  });
}

export async function removeSupervisor(companyId: string, supervisorId: string) {
  return withTenantContext(companyId, (tx) => tx.condominiumSupervisor.delete({ where: { id: supervisorId } }));
}
