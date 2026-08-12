import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';

export type PettyCashSummary = {
  assigned: number;
  spent: number;
  balance: number;
};

/**
 * Caja chica de un condominio.
 *
 * El saldo NUNCA se guarda: se calcula como asignaciones menos gastos.
 * Así no puede quedar desincronizado de sus movimientos, que es el
 * error clásico de llevar un "saldo" como columna.
 */
export async function getPettyCash(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    // Las dos listas completas SÍ se traen enteras a propósito: se
    // usan también para el informe exportable de caja chica
    // (`mantenimiento/informe-caja-chica`), que tiene que cuadrar con
    // TODO el historial, no solo lo reciente. Lo que no conviene es
    // sumarlas en JS para el resumen — ver los `aggregate` de abajo —
    // porque eso crece sin límite con la antigüedad del condominio sin
    // necesidad; el saldo sale igual de una agregación en Postgres.
    const [allocations, expenses, assignedAgg, spentAgg] = await Promise.all([
      tx.pettyCashAllocation.findMany({
        where: { companyId, condominiumId },
        orderBy: [{ allocatedOn: 'desc' }, { createdAt: 'desc' }],
        include: { createdBy: { select: { fullName: true } } },
      }),
      tx.pettyCashExpense.findMany({
        where: { companyId, condominiumId },
        orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
        include: { createdBy: { select: { fullName: true } } },
      }),
      tx.pettyCashAllocation.aggregate({ where: { companyId, condominiumId }, _sum: { amount: true } }),
      tx.pettyCashExpense.aggregate({ where: { companyId, condominiumId }, _sum: { amount: true } }),
    ]);

    const assigned = Number(assignedAgg._sum.amount ?? 0);
    const spent = Number(spentAgg._sum.amount ?? 0);
    const summary: PettyCashSummary = { assigned, spent, balance: assigned - spent };
    return { allocations, expenses, summary };
  });
}

export async function allocatePettyCash(
  companyId: string,
  userId: string,
  userName: string,
  input: { condominiumId: string; amount: number; allocatedOn: Date; note?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const row = await tx.pettyCashAllocation.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        amount: input.amount,
        allocatedOn: input.allocatedOn,
        note: input.note || null,
        createdById: userId,
      },
    });
    await logActivity(tx, companyId, {
      userId,
      userName,
      module: 'Caja chica',
      action: 'Monto asignado',
      target: `₡${input.amount.toLocaleString('es-CR')}`,
    });
    return row;
  });
}

export async function addPettyCashExpense(
  companyId: string,
  userId: string,
  userName: string,
  input: {
    condominiumId: string;
    spentOn: Date;
    detail: string;
    amount: number;
    invoiceUrl?: string;
    invoiceName?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    // El gasto no puede dejar la caja en rojo: se valida contra el
    // saldo real dentro de la misma transacción.
    const [alloc, exp] = await Promise.all([
      tx.pettyCashAllocation.aggregate({
        where: { companyId, condominiumId: input.condominiumId },
        _sum: { amount: true },
      }),
      tx.pettyCashExpense.aggregate({
        where: { companyId, condominiumId: input.condominiumId },
        _sum: { amount: true },
      }),
    ]);
    const balance = Number(alloc._sum.amount ?? 0) - Number(exp._sum.amount ?? 0);
    if (input.amount > balance) {
      throw new Error(
        `El gasto (₡${input.amount.toLocaleString('es-CR')}) supera el saldo disponible de la caja chica (₡${balance.toLocaleString('es-CR')}).`
      );
    }

    const row = await tx.pettyCashExpense.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        spentOn: input.spentOn,
        detail: input.detail,
        amount: input.amount,
        invoiceUrl: input.invoiceUrl || null,
        invoiceName: input.invoiceName || null,
        createdById: userId,
      },
    });
    await logActivity(tx, companyId, {
      userId,
      userName,
      module: 'Caja chica',
      action: 'Gasto registrado',
      target: input.detail,
    });
    return row;
  });
}

export async function deletePettyCashExpense(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) => tx.pettyCashExpense.delete({ where: { id } }));
}

export async function deletePettyCashAllocation(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) => tx.pettyCashAllocation.delete({ where: { id } }));
}
