import { withTenantContext } from '@/lib/db';
import {
  decideMatch,
  fingerprintOf,
  normalizeBankText,
  type BankTx,
  type Candidate,
  type MatchRule,
} from '@/lib/domain/bank-matching';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Conciliación bancaria.
 *
 * El objetivo es que el administrador suba el estado de cuenta y el
 * sistema resuelva la mayoría solo. Lo que no alcance el umbral queda
 * propuesto o para revisión — nunca se concilia a la fuerza.
 */

export type ParsedRow = {
  date: Date;
  description: string;
  reference?: string | null;
  amount: number;
  balanceAfter?: number | null;
};

export type ImportResult = {
  read: number;
  inserted: number;
  duplicates: number;
  autoMatched: number;
  proposed: number;
  manual: number;
};

/**
 * Importa movimientos y corre la conciliación sobre los nuevos.
 * Los repetidos se descartan por huella: reimportar el mismo archivo
 * (o uno que se traslapa con el anterior) no duplica nada.
 */
export async function importBankTransactions(
  companyId: string,
  bankAccountId: string,
  rows: ParsedRow[],
  batchId: string
): Promise<ImportResult> {
  const result: ImportResult = {
    read: rows.length,
    inserted: 0,
    duplicates: 0,
    autoMatched: 0,
    proposed: 0,
    manual: 0,
  };

  return withTenantContext(companyId, async (tx) => {
    const account = await tx.bankAccount.findUniqueOrThrow({
      where: { id: bankAccountId },
      select: { condominiumId: true },
    });

    const newIds: string[] = [];
    for (const row of rows) {
      const fingerprint = fingerprintOf(row);
      const exists = await tx.bankTransaction.findUnique({
        where: { bankAccountId_fingerprint: { bankAccountId, fingerprint } },
        select: { id: true },
      });
      if (exists) {
        result.duplicates += 1;
        continue;
      }
      const created = await tx.bankTransaction.create({
        data: {
          companyId,
          bankAccountId,
          txDate: row.date,
          description: row.description,
          reference: row.reference ?? null,
          amount: row.amount,
          balanceAfter: row.balanceAfter ?? null,
          fingerprint,
          importBatchId: batchId,
        },
      });
      newIds.push(created.id);
      result.inserted += 1;
    }

    if (newIds.length === 0) return result;

    // --- Candidatos y reglas aprendidas ---
    const [payments, expensePayments, rules] = await Promise.all([
      tx.payment.findMany({
        where: { condominiumId: account.condominiumId, status: 'aplicado' },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          reference: true,
          propertyId: true,
          property: { select: { code: true, members: { select: { person: { select: { fullName: true } } }, take: 1 } } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 500,
      }),
      tx.expensePayment.findMany({
        where: { companyId, expense: { condominiumId: account.condominiumId } },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          reference: true,
          expense: { select: { description: true, supplierId: true, supplier: { select: { legalName: true, tradeName: true } } } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 500,
      }),
      tx.bankMatchRule.findMany({ where: { bankAccountId } }),
    ]);

    const candidates: Candidate[] = [
      ...payments.map((p): Candidate => ({
        id: p.id,
        type: 'payment',
        date: p.paymentDate,
        amount: Number(p.amount),
        reference: p.reference,
        label: p.property.members[0]?.person.fullName ?? p.property.code,
        // El dueño es la FILIAL: es quien vuelve a pagar el mes que viene.
        ownerId: p.propertyId,
      })),
      ...expensePayments.map((e): Candidate => ({
        id: e.id,
        type: 'expense_payment',
        date: e.paymentDate,
        amount: Number(e.amount),
        reference: e.reference,
        label: e.expense.supplier?.tradeName ?? e.expense.supplier?.legalName ?? e.expense.description,
        ownerId: e.expense.supplierId,
      })),
    ];

    const matchRules: MatchRule[] = rules.map((r) => ({
      pattern: r.pattern,
      targetType: r.targetType,
      targetId: r.targetId,
      timesUsed: r.timesUsed,
    }));

    // Un candidato ya conciliado no puede usarse dos veces.
    const alreadyUsed = new Set(
      (
        await tx.bankTransaction.findMany({
          where: { bankAccountId, matchedId: { not: null } },
          select: { matchedId: true },
        })
      ).map((t) => t.matchedId!)
    );

    for (const id of newIds) {
      const row = await tx.bankTransaction.findUniqueOrThrow({ where: { id } });
      const bankTx: BankTx = {
        id: row.id,
        date: row.txDate,
        amount: Number(row.amount),
        description: row.description,
        reference: row.reference,
      };

      const available = candidates.filter((c) => !alreadyUsed.has(c.id));
      const decision = decideMatch(bankTx, available, matchRules);

      if (decision.action === 'automatico' && decision.best) {
        await tx.bankTransaction.update({
          where: { id },
          data: {
            status: 'conciliado',
            matchedType: decision.best.candidate.type,
            matchedId: decision.best.candidate.id,
            matchConfidence: decision.best.confidence,
            matchedAt: new Date(),
          },
        });
        alreadyUsed.add(decision.best.candidate.id);
        result.autoMatched += 1;
      } else if (decision.action === 'propuesto' && decision.best) {
        await tx.bankTransaction.update({
          where: { id },
          data: {
            status: 'propuesto',
            matchedType: decision.best.candidate.type,
            matchedId: decision.best.candidate.id,
            matchConfidence: decision.best.confidence,
          },
        });
        result.proposed += 1;
      } else {
        result.manual += 1;
      }
    }

    return result;
  });
}

/**
 * Confirma una conciliación propuesta o hecha a mano.
 * Aquí es donde el sistema APRENDE: guarda el patrón del texto
 * bancario para que la próxima vez lo resuelva solo.
 */
export async function confirmMatch(
  companyId: string,
  transactionId: string,
  candidate: { type: string; id: string },
  userId: string
) {
  return withTenantContext(companyId, async (tx) => {
    const row = await tx.bankTransaction.findUniqueOrThrow({ where: { id: transactionId } });

    await tx.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'conciliado',
        matchedType: candidate.type,
        matchedId: candidate.id,
        matchedAt: new Date(),
        matchedById: userId,
        matchConfidence: row.matchConfidence ?? 100,
      },
    });

    // --- Aprendizaje ---
    //
    // La regla NUNCA guarda el id del pago: un pago es un movimiento
    // único que no se repite, así que una regla ligada a él sería
    // inútil desde el mes siguiente. Se guarda el DUEÑO — la filial
    // que paga o el proveedor al que se le paga — que sí vuelve.
    let ownerType: string | null = null;
    let ownerId: string | null = null;
    if (candidate.type === 'payment') {
      const payment = await tx.payment.findUnique({
        where: { id: candidate.id },
        select: { propertyId: true },
      });
      ownerType = 'property';
      ownerId = payment?.propertyId ?? null;
    } else {
      const ep = await tx.expensePayment.findUnique({
        where: { id: candidate.id },
        select: { expense: { select: { supplierId: true } } },
      });
      ownerType = 'supplier';
      ownerId = ep?.expense.supplierId ?? null;
    }

    // Se guardan las primeras palabras del texto del banco. Con menos
    // de dos el patrón sería tan genérico que produciría falsos
    // positivos, así que no se guarda.
    const pattern = normalizeBankText(row.description).split(' ').slice(0, 4).join(' ');
    if (ownerId && pattern.split(' ').length >= 2) {
      await tx.bankMatchRule.upsert({
        where: { bankAccountId_pattern: { bankAccountId: row.bankAccountId, pattern } },
        create: {
          companyId,
          bankAccountId: row.bankAccountId,
          pattern,
          targetType: ownerType!,
          targetId: ownerId,
        },
        update: { timesUsed: { increment: 1 }, lastUsedAt: new Date(), targetId: ownerId },
      });
    }
  });
}

export async function unmatch(companyId: string, transactionId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'sin_conciliar',
        matchedType: null,
        matchedId: null,
        matchConfidence: null,
        matchedAt: null,
        matchedById: null,
      },
    })
  );
}

export async function ignoreTransaction(companyId: string, transactionId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.bankTransaction.update({ where: { id: transactionId }, data: { status: 'ignorado' } })
  );
}

/** Movimientos y candidatos para la pantalla de conciliación. */
export async function getReconciliationView(companyId: string, bankAccountId: string) {
  return withTenantContext(companyId, async (tx) => {
    const account = await tx.bankAccount.findUniqueOrThrow({ where: { id: bankAccountId } });

    const [transactions, payments, expensePayments] = await Promise.all([
      tx.bankTransaction.findMany({
        where: { bankAccountId },
        orderBy: [{ txDate: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      tx.payment.findMany({
        where: { condominiumId: account.condominiumId, status: 'aplicado' },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          reference: true,
          propertyId: true,
          property: { select: { code: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 300,
      }),
      tx.expensePayment.findMany({
        where: { companyId, expense: { condominiumId: account.condominiumId } },
        select: {
          id: true,
          paymentDate: true,
          amount: true,
          reference: true,
          expense: { select: { expenseNumber: true, description: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 300,
      }),
    ]);

    const totals = {
      conciliado: transactions.filter((t) => t.status === 'conciliado').length,
      propuesto: transactions.filter((t) => t.status === 'propuesto').length,
      pendiente: transactions.filter((t) => t.status === 'sin_conciliar').length,
      ignorado: transactions.filter((t) => t.status === 'ignorado').length,
    };

    return { account, transactions, payments, expensePayments, totals };
  });
}

/** Saldo del banco según los movimientos importados. */
export function bankStatementBalance(transactions: { amount: any }[]): number {
  return round2(transactions.reduce((s, t) => s + Number(t.amount), 0));
}
