import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { listBankAccountsWithBalance } from '@/lib/services/bank-accounts';

/**
 * Flujo de caja: histórico real y proyección.
 *
 * El histórico sale del libro diario (cobrado y pagado de verdad). La
 * proyección se dibuja SIEMPRE aparte y se calcula con la tasa de
 * recuperación real del condominio, no con un supuesto optimista de
 * que todo el mundo paga.
 */

export type CashFlowMonth = {
  period: string; // YYYY-MM
  label: string;
  income: number;
  expense: number;
  net: number;
  balance: number;
  projected: boolean;
};

export type CashFlowResult = {
  months: CashFlowMonth[];
  currentBalance: number;
  /** Proporción histórica de lo facturado que efectivamente se cobra. */
  collectionRate: number;
  /** Gasto mensual promedio de los últimos meses. */
  averageExpense: number;
  /** Meses de operación que cubre el saldo actual. */
  runwayMonths: number | null;
};

const MONTH_LABEL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function periodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getCashFlow(
  companyId: string,
  condominiumId: string,
  opts: { history?: number; forecast?: number } = {}
): Promise<CashFlowResult> {
  const history = opts.history ?? 12;
  const forecast = opts.forecast ?? 6;
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - history + 1, 1));

  return withTenantContext(companyId, async (tx) => {
    const [payments, expensePayments, charges, banks] = await Promise.all([
      // Ingreso real: lo que efectivamente entró.
      tx.payment.findMany({
        where: { condominiumId, status: 'aplicado', paymentDate: { gte: from } },
        select: { paymentDate: true, amount: true },
      }),
      // Egreso real: lo que efectivamente se pagó.
      tx.expensePayment.findMany({
        where: { companyId, expense: { condominiumId }, paymentDate: { gte: from } },
        select: { paymentDate: true, amount: true },
      }),
      // Facturado: sirve para calcular la tasa de recuperación real.
      tx.charge.findMany({
        where: { condominiumId, status: { not: 'anulado' }, createdAt: { gte: from } },
        select: { createdAt: true, amount: true },
      }),
      listBankAccountsWithBalance(companyId, condominiumId),
    ]);

    const buckets = new Map<string, { income: number; expense: number; charged: number }>();
    const ensure = (k: string) => {
      if (!buckets.has(k)) buckets.set(k, { income: 0, expense: 0, charged: 0 });
      return buckets.get(k)!;
    };

    for (const p of payments) ensure(periodKey(p.paymentDate)).income += Number(p.amount);
    for (const e of expensePayments) ensure(periodKey(e.paymentDate)).expense += Number(e.amount);
    for (const c of charges) ensure(periodKey(c.createdAt)).charged += Number(c.amount);

    const currentBalance = round2(banks.reduce((s, b) => s + b.balance, 0));

    // --- Histórico ---
    const months: CashFlowMonth[] = [];
    let totalCharged = 0;
    let totalCollected = 0;
    let expenseSum = 0;
    let expenseMonths = 0;

    for (let i = 0; i < history; i += 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - history + 1 + i, 1));
      const key = periodKey(d);
      const b = buckets.get(key) ?? { income: 0, expense: 0, charged: 0 };
      totalCharged += b.charged;
      totalCollected += b.income;
      if (b.expense > 0) {
        expenseSum += b.expense;
        expenseMonths += 1;
      }
      months.push({
        period: key,
        label: `${MONTH_LABEL[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        income: round2(b.income),
        expense: round2(b.expense),
        net: round2(b.income - b.expense),
        balance: 0, // se completa abajo
        projected: false,
      });
    }

    // Tasa de recuperación real, acotada a un rango razonable: con
    // pocos datos podría dar 0 o valores absurdos y arruinar la
    // proyección.
    const rawRate = totalCharged > 0 ? totalCollected / totalCharged : 0.9;
    const collectionRate = Math.min(1, Math.max(0.3, rawRate));
    const averageExpense = expenseMonths > 0 ? round2(expenseSum / expenseMonths) : 0;

    // --- Proyección ---
    // Ingreso esperado = lo que se factura al mes × tasa de recuperación.
    const monthlyCharged =
      totalCharged > 0 ? totalCharged / history : months.reduce((s, m) => s + m.income, 0) / history;
    const projectedIncome = round2(monthlyCharged * collectionRate);

    for (let i = 1; i <= forecast; i += 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      months.push({
        period: periodKey(d),
        label: `${MONTH_LABEL[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        income: projectedIncome,
        expense: averageExpense,
        net: round2(projectedIncome - averageExpense),
        balance: 0,
        projected: true,
      });
    }

    // El saldo acumulado se ancla al saldo bancario de HOY y se
    // proyecta hacia adelante; hacia atrás se reconstruye restando.
    const todayIndex = history - 1;
    months[todayIndex]!.balance = currentBalance;
    for (let i = todayIndex - 1; i >= 0; i -= 1) {
      months[i]!.balance = round2(months[i + 1]!.balance - months[i + 1]!.net);
    }
    for (let i = todayIndex + 1; i < months.length; i += 1) {
      months[i]!.balance = round2(months[i - 1]!.balance + months[i]!.net);
    }

    const runwayMonths = averageExpense > 0 ? round2(currentBalance / averageExpense) : null;

    return { months, currentBalance, collectionRate, averageExpense, runwayMonths };
  });
}
