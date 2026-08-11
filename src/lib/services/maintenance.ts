import { withTenantContext } from '@/lib/db';
import { recordMaintenanceExpense } from '@/lib/services/accounting';
import { logActivity } from '@/lib/services/audit';

export async function listAssets(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.asset.findMany({ where: { condominiumId }, include: { category: true }, orderBy: { name: 'asc' } })
  );
}

export type AssetInput = {
  name: string;
  categoryId?: string;
  description?: string;
  approxCost?: number;
  location?: string;
  photoUrl?: string;
};

export async function createAsset(companyId: string, input: AssetInput & { condominiumId: string }) {
  return withTenantContext(companyId, (tx) =>
    tx.asset.create({
      data: {
        condominiumId: input.condominiumId,
        name: input.name,
        categoryId: input.categoryId || null,
        description: input.description || null,
        approxCost: input.approxCost ?? null,
        location: input.location || null,
        photoUrl: input.photoUrl ?? null,
      },
    })
  );
}

export async function updateAsset(companyId: string, assetId: string, input: AssetInput) {
  return withTenantContext(companyId, (tx) =>
    tx.asset.update({
      where: { id: assetId },
      data: {
        name: input.name,
        categoryId: input.categoryId || null,
        description: input.description || null,
        approxCost: input.approxCost ?? null,
        location: input.location || null,
        // Sin foto nueva, se conserva la existente.
        ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
      },
    })
  );
}

export async function deleteAsset(companyId: string, assetId: string) {
  return withTenantContext(companyId, async (tx) => {
    const ticketCount = await tx.maintenanceTicket.count({ where: { assetId } });
    if (ticketCount > 0) {
      throw new Error(
        `Este activo tiene ${ticketCount} ticket(s) asociados — no se puede eliminar sin perder ese historial. Puedes dejarlo fuera de servicio en su lugar.`
      );
    }
    return tx.asset.delete({ where: { id: assetId } });
  });
}

// ============================================================
// Categorías de activos
//
// Catálogo propio de cada condominio, editable desde "Editar más
// opciones" en el selector de Categoría — mismo patrón que el
// catálogo de incumplimientos (ViolationType).
// ============================================================

export async function listAssetCategories(companyId: string, condominiumId: string, soloActivas = false) {
  return withTenantContext(companyId, (tx) =>
    tx.assetCategoryOption.findMany({
      where: { condominiumId, ...(soloActivas ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  );
}

export async function createAssetCategory(companyId: string, condominiumId: string, name: string) {
  return withTenantContext(companyId, (tx) =>
    tx.assetCategoryOption.create({ data: { condominiumId, name: name.trim() } })
  );
}

export async function renameAssetCategory(companyId: string, categoryId: string, name: string) {
  return withTenantContext(companyId, async (tx) => {
    await assertCategoryInCompany(tx, categoryId, companyId);
    return tx.assetCategoryOption.update({ where: { id: categoryId }, data: { name: name.trim() } });
  });
}

export async function toggleAssetCategory(companyId: string, categoryId: string, isActive: boolean) {
  return withTenantContext(companyId, async (tx) => {
    await assertCategoryInCompany(tx, categoryId, companyId);
    return tx.assetCategoryOption.update({ where: { id: categoryId }, data: { isActive } });
  });
}

export async function deleteAssetCategory(companyId: string, categoryId: string) {
  return withTenantContext(companyId, async (tx) => {
    await assertCategoryInCompany(tx, categoryId, companyId);
    const enUso = await tx.asset.count({ where: { categoryId } });
    if (enUso > 0) {
      throw new Error(`Esta categoría tiene ${enUso} activo(s) — borrarla los dejaría sin categoría. Desactívala en su lugar.`);
    }
    return tx.assetCategoryOption.delete({ where: { id: categoryId } });
  });
}

async function assertCategoryInCompany(tx: any, categoryId: string, companyId: string) {
  const c = await tx.assetCategoryOption.findFirst({
    where: { id: categoryId, condominium: { companyId } },
    select: { id: true },
  });
  if (!c) throw new Error('La categoría no existe.');
}

export async function listProviders(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) => tx.provider.findMany({ where: { condominiumId }, orderBy: { name: 'asc' } }));
}

export type ProviderInput = { name: string; serviceType?: string; phone?: string; email?: string };

export async function createProvider(companyId: string, input: ProviderInput & { condominiumId: string }) {
  return withTenantContext(companyId, (tx) =>
    tx.provider.create({
      data: {
        condominiumId: input.condominiumId,
        name: input.name,
        serviceType: input.serviceType || null,
        phone: input.phone || null,
        email: input.email || null,
      },
    })
  );
}

export async function updateProvider(companyId: string, providerId: string, input: ProviderInput) {
  return withTenantContext(companyId, (tx) =>
    tx.provider.update({
      where: { id: providerId },
      data: {
        name: input.name,
        serviceType: input.serviceType || null,
        phone: input.phone || null,
        email: input.email || null,
      },
    })
  );
}

export async function deleteProvider(companyId: string, providerId: string) {
  return withTenantContext(companyId, async (tx) => {
    const [ticketCount, projectCount] = await Promise.all([
      tx.maintenanceTicket.count({ where: { providerId } }),
      tx.project.count({ where: { providerId } }),
    ]);
    if (ticketCount + projectCount > 0) {
      throw new Error(
        `Este proveedor tiene ${ticketCount} ticket(s) y ${projectCount} proyecto(s) asociados — no se puede eliminar sin perder ese historial.`
      );
    }
    return tx.provider.delete({ where: { id: providerId } });
  });
}

export async function listTickets(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.maintenanceTicket.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: { asset: { select: { name: true } }, provider: { select: { name: true } } },
    })
  );
}

export async function createTicket(
  companyId: string,
  userId: string,
  input: {
    condominiumId: string;
    assetId?: string;
    providerId?: string;
    ticketType: string;
    title: string;
    description?: string;
    priority: string;
  }
) {
  return withTenantContext(companyId, (tx) =>
    tx.maintenanceTicket.create({
      data: {
        condominiumId: input.condominiumId,
        assetId: input.assetId || null,
        providerId: input.providerId || null,
        ticketType: input.ticketType as any,
        title: input.title,
        description: input.description || null,
        priority: input.priority as any,
        createdById: userId,
      },
    })
  );
}

export async function updateTicketStatus(companyId: string, ticketId: string, status: string) {
  return withTenantContext(companyId, (tx) =>
    tx.maintenanceTicket.update({ where: { id: ticketId }, data: { status: status as any } })
  );
}

/**
 * Completar un ticket CON costo genera su asiento contable
 * automáticamente (Débito Gasto / Crédito Banco) — igual patrón que
 * ya usa Finanzas. Sin costo, solo cambia el estado.
 */
export async function completeTicket(companyId: string, ticketId: string, userId: string, userName: string, cost?: number) {
  return withTenantContext(companyId, async (tx) => {
    const ticket = await tx.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status: 'completado', completedAt: new Date(), cost: cost ?? null },
    });
    if (cost && cost > 0) {
      await recordMaintenanceExpense(tx, companyId, {
        ticketId: ticket.id,
        condominiumId: ticket.condominiumId,
        title: ticket.title,
        amount: cost,
      });
    }
    await logActivity(tx, companyId, { userId, userName, module: 'Mantenimiento', action: 'Ticket completado', target: ticket.title });
    return ticket;
  });
}

/**
 * Insight de mantenimiento recurrente — dato real de la base, sin
 * necesidad de IA: activos con 2+ tickets correctivos sugieren
 * revisar reemplazo en vez de seguir reparando.
 */
export async function getRecurringMaintenanceInsights(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const assets = await tx.asset.findMany({
      where: { condominiumId },
      include: { tickets: { where: { ticketType: 'correctivo' } } },
    });
    return assets
      .filter((a) => a.tickets.length >= 2)
      .map((a) => ({ assetName: a.name, correctiveCount: a.tickets.length }));
  });
}
