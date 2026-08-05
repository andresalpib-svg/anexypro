import type { Prisma } from '@prisma/client';
import { withTenantContext } from '@/lib/db';

/** 'YYYY-MM' de una fecha, en calendario UTC. */
export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * ¿El período de esta fecha está cerrado?
 *
 * Se consulta DENTRO de la transacción del asiento para que la
 * verificación y la escritura sean atómicas: sin eso, un cierre
 * simultáneo podría dejar pasar un asiento.
 */
export async function isPeriodClosed(
  tx: Prisma.TransactionClient,
  condominiumId: string,
  date: Date
): Promise<boolean> {
  const period = await tx.accountingPeriod.findUnique({
    where: { condominiumId_period: { condominiumId, period: periodOf(date) } },
    select: { status: true },
  });
  return period?.status === 'cerrado';
}

export async function listPeriods(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.accountingPeriod.findMany({
      where: { condominiumId },
      orderBy: { period: 'desc' },
      include: { closedBy: { select: { fullName: true } } },
    })
  );
}

export type CloseCheck = { key: string; label: string; ok: boolean; detail: string };

/**
 * Verificaciones previas al cierre. Devuelve el estado de cada una
 * para mostrarlas como lista de comprobación: el administrador ve qué
 * falta y por qué, no un "no se puede cerrar" sin explicación.
 */
export async function getCloseChecks(
  companyId: string,
  condominiumId: string,
  period: string
): Promise<CloseCheck[]> {
  const [year, month] = period.split('-').map(Number);
  const from = new Date(Date.UTC(year!, month! - 1, 1));
  const to = new Date(Date.UTC(year!, month!, 1));

  return withTenantContext(companyId, async (tx) => {
    const [entries, draftExpenses, chargesWithoutEntry, unappliedPayments] = await Promise.all([
      tx.journalEntry.findMany({
        where: { condominiumId, entryDate: { gte: from, lt: to }, status: 'confirmado' },
        include: { lines: { select: { debit: true, credit: true } } },
      }),
      tx.expense.count({
        where: { condominiumId, issueDate: { gte: from, lt: to }, status: { in: ['borrador', 'por_aprobar'] } },
      }),
      tx.charge.count({
        where: {
          condominiumId,
          createdAt: { gte: from, lt: to },
          status: { not: 'anulado' },
          journalEntries: { none: {} },
        },
      }),
      tx.payment.count({
        where: {
          condominiumId,
          paymentDate: { gte: from, lt: to },
          status: 'aplicado',
          allocations: { none: {} },
        },
      }),
    ]);

    let debits = 0;
    let credits = 0;
    for (const e of entries) {
      for (const l of e.lines) {
        debits += Number(l.debit);
        credits += Number(l.credit);
      }
    }
    const balanced = Math.abs(debits - credits) < 0.01;

    return [
      {
        key: 'balance',
        label: 'Los asientos del mes cuadran',
        ok: balanced,
        detail: balanced
          ? `${entries.length} asientos, débitos y créditos iguales`
          : `Diferencia de ₡${Math.abs(debits - credits).toLocaleString('es-CR')} entre débitos y créditos`,
      },
      {
        key: 'gastos',
        label: 'No quedan gastos sin aprobar',
        ok: draftExpenses === 0,
        detail: draftExpenses === 0 ? 'Todos los gastos están aprobados o pagados' : `${draftExpenses} gasto(s) en borrador o esperando aprobación`,
      },
      {
        key: 'cargos',
        label: 'Todos los cargos generaron su asiento',
        ok: chargesWithoutEntry === 0,
        detail: chargesWithoutEntry === 0 ? 'Sin cargos huérfanos' : `${chargesWithoutEntry} cargo(s) sin asiento contable`,
      },
      {
        key: 'pagos',
        label: 'Todos los pagos están aplicados',
        ok: unappliedPayments === 0,
        detail: unappliedPayments === 0 ? 'Sin pagos sin aplicar' : `${unappliedPayments} pago(s) sin aplicar a ningún cargo`,
      },
    ];
  });
}

export async function closePeriod(
  companyId: string,
  condominiumId: string,
  period: string,
  userId: string
) {
  const checks = await getCloseChecks(companyId, condominiumId, period);
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    throw new Error(`No se puede cerrar: ${failed.map((f) => f.label.toLowerCase()).join(', ')}.`);
  }

  return withTenantContext(companyId, (tx) =>
    tx.accountingPeriod.upsert({
      where: { condominiumId_period: { condominiumId, period } },
      create: { companyId, condominiumId, period, status: 'cerrado', closedById: userId, closedAt: new Date() },
      update: { status: 'cerrado', closedById: userId, closedAt: new Date(), reopenReason: null },
    })
  );
}

/** Reabrir exige motivo: queda registrado para la auditoría. */
export async function reopenPeriod(
  companyId: string,
  condominiumId: string,
  period: string,
  reason: string
) {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Indica el motivo de la reapertura.');
  }
  return withTenantContext(companyId, (tx) =>
    tx.accountingPeriod.update({
      where: { condominiumId_period: { condominiumId, period } },
      data: { status: 'abierto', reopenReason: reason.trim() },
    })
  );
}
