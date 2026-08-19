import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import { logChange } from '@/lib/services/audit-trail';

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
      // Un movimiento anulado sigue en la lista de arriba (para que el
      // informe muestre que existió) pero no entra en el saldo.
      tx.pettyCashAllocation.aggregate({
        where: { companyId, condominiumId, voidedAt: null },
        _sum: { amount: true },
      }),
      tx.pettyCashExpense.aggregate({
        where: { companyId, condominiumId, voidedAt: null },
        _sum: { amount: true },
      }),
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

/**
 * Anula un gasto o una asignación de caja chica. NO los borra.
 *
 * Antes los eliminaba de verdad, y encima sin registrar nada: el saldo
 * de la caja cambiaba solo y no había forma de saber qué movimiento
 * desapareció, quién lo quitó ni por qué —siendo que el alta sí se
 * registraba en la bitácora (Etapa 8, hallazgo 8.4)—. Un movimiento
 * anulado deja de sumar al saldo pero sigue en el informe, marcado.
 */
async function anularMovimientoCaja(
  companyId: string,
  id: string,
  reason: string,
  user: { id: string; name: string },
  clase: 'gasto' | 'asignacion'
) {
  if (!reason || reason.trim().length < 5) throw new Error('Indicá el motivo de la anulación.');
  return withTenantContext(companyId, async (tx) => {
    const esGasto = clase === 'gasto';
    const fila = esGasto
      ? await tx.pettyCashExpense.findUniqueOrThrow({ where: { id } })
      : await tx.pettyCashAllocation.findUniqueOrThrow({ where: { id } });
    if (fila.voidedAt) throw new Error('Este movimiento ya estaba anulado.');

    const data = { voidedAt: new Date(), voidReason: reason.trim(), voidedById: user.id };
    if (esGasto) await tx.pettyCashExpense.update({ where: { id }, data });
    else await tx.pettyCashAllocation.update({ where: { id }, data });

    await logChange(tx, companyId, {
      entity: esGasto ? 'petty_cash_expenses' : 'petty_cash_allocations',
      entityId: id,
      condominiumId: fila.condominiumId,
      action: 'anular',
      userId: user.id,
      motivo: reason.trim(),
      snapshot: esGasto
        ? { detalle: (fila as any).detail, monto: fila.amount, fecha: (fila as any).spentOn }
        : { nota: (fila as any).note, monto: fila.amount, fecha: (fila as any).allocatedOn },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Caja chica',
      action: esGasto ? 'Gasto anulado' : 'Asignación anulada',
      target: `₡${Number(fila.amount).toLocaleString('es-CR')} · ${reason.trim()}`,
    });
  });
}

export async function voidPettyCashExpense(
  companyId: string,
  id: string,
  reason: string,
  user: { id: string; name: string }
) {
  return anularMovimientoCaja(companyId, id, reason, user, 'gasto');
}

export async function voidPettyCashAllocation(
  companyId: string,
  id: string,
  reason: string,
  user: { id: string; name: string }
) {
  return anularMovimientoCaja(companyId, id, reason, user, 'asignacion');
}
