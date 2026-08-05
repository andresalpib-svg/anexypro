import { withTenantContext } from '@/lib/db';

/**
 * Reportes consolidados multi-condominio. Reutiliza los mismos
 * modelos que ya usan Finanzas/Mantenimiento/Proyectos — no duplica
 * ninguna lógica de negocio, solo agrega para varios condominios a la
 * vez. Nunca suma montos de condominios con monedas distintas (CRC
 * vs. USD) en un mismo total — se agrupan por moneda, igual regla que
 * ya aplicaba el prototipo.
 */

export async function getFinancialReport(companyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const condos = await tx.condominium.findMany({ where: { status: 'activo', deletedAt: null } });
    const rows = await Promise.all(
      condos.map(async (c) => {
        const charges = await tx.charge.aggregate({
          where: { condominiumId: c.id, status: { not: 'anulado' } },
          _sum: { amount: true },
        });
        const allocations = await tx.paymentAllocation.aggregate({
          where: { charge: { condominiumId: c.id }, payment: { status: 'aplicado' } },
          _sum: { amount: true },
        });
        const billed = Number(charges._sum.amount ?? 0);
        const collected = Number(allocations._sum.amount ?? 0);
        return { condoId: c.id, condoName: c.name, currency: c.currency, billed, collected, pct: billed ? Math.round((collected / billed) * 100) : 0 };
      })
    );
    return rows;
  });
}

export async function getDelinquencyReport(companyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const properties = await tx.property.findMany({
      where: { condominium: { status: 'activo', deletedAt: null } },
      include: { condominium: { select: { name: true, currency: true } } },
    });
    const charges = await tx.charge.findMany({
      where: { status: { in: ['pendiente', 'parcial'] }, dueDate: { lt: new Date() } },
      select: { id: true, propertyId: true, amount: true, dueDate: true },
    });
    const allocations = await tx.paymentAllocation.findMany({
      where: { charge: { status: { in: ['pendiente', 'parcial'] } }, payment: { status: 'aplicado' } },
      select: { chargeId: true, amount: true },
    });
    const paidByCharge = new Map<string, number>();
    for (const a of allocations) paidByCharge.set(a.chargeId, (paidByCharge.get(a.chargeId) ?? 0) + Number(a.amount));

    const byProperty = new Map<string, { balance: number; oldestDueDate: Date }>();
    for (const c of charges) {
      const owed = Number(c.amount) - (paidByCharge.get(c.id) ?? 0);
      if (owed <= 0) continue;
      const cur = byProperty.get(c.propertyId) ?? { balance: 0, oldestDueDate: c.dueDate };
      cur.balance += owed;
      if (c.dueDate < cur.oldestDueDate) cur.oldestDueDate = c.dueDate;
      byProperty.set(c.propertyId, cur);
    }

    return properties
      .filter((p) => byProperty.has(p.id))
      .map((p) => {
        const d = byProperty.get(p.id)!;
        const daysOverdue = Math.floor((Date.now() - d.oldestDueDate.getTime()) / 86400000);
        return { propertyCode: p.code, condoName: p.condominium.name, currency: p.condominium.currency, balance: d.balance, daysOverdue };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  });
}

export async function getMaintenanceReport(companyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const tickets = await tx.maintenanceTicket.findMany({
      where: { condominium: { status: 'activo', deletedAt: null } },
      include: { condominium: { select: { name: true, currency: true } } },
    });
    const byStatus: Record<string, number> = {};
    let totalCost = 0;
    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.cost) totalCost += Number(t.cost);
    }
    return { total: tickets.length, byStatus, totalCost, preventivos: tickets.filter((t) => t.ticketType === 'preventivo').length };
  });
}

export async function getProjectsReport(companyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const projects = await tx.project.findMany({
      where: { condominium: { status: 'activo', deletedAt: null } },
      include: { condominium: { select: { name: true, currency: true } }, expenses: { select: { amount: true } } },
    });
    return projects.map((p) => ({
      name: p.name,
      condoName: p.condominium.name,
      currency: p.condominium.currency,
      status: p.status,
      budget: Number(p.budget),
      spent: p.expenses.reduce((s, e) => s + Number(e.amount), 0),
    }));
  });
}
