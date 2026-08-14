import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Presupuesto anual y su ejecución.
 *
 * El modelo `BudgetLine` existía en la base desde el inicio pero no
 * tenía una sola pantalla. Lo importante de esta implementación no es
 * capturar montos: es que el presupuesto se SUGIERE a partir del gasto
 * real de los últimos 12 meses, para que el administrador ajuste en
 * vez de construir desde cero.
 */

export type BudgetRow = {
  accountId: string;
  code: string;
  name: string;
  budgeted: number;
  executed: number;
  available: number;
  /** Porcentaje ejecutado. Puede pasar de 100. */
  percent: number;
  /** Gasto real del año anterior, para comparar. */
  lastYear: number;
  /** Sugerencia calculada si todavía no hay presupuesto. */
  suggested: number;
};

export type BudgetSummary = {
  rows: BudgetRow[];
  totalBudgeted: number;
  totalExecuted: number;
  /** Cuánto del año ha transcurrido — para saber si el ritmo va bien. */
  yearProgress: number;
  overBudget: BudgetRow[];
};

/** Alerta según el porcentaje ejecutado. */
export function budgetAlert(percent: number): 'ok' | 'atencion' | 'excedido' | 'critico' {
  if (percent >= 120) return 'critico';
  if (percent >= 100) return 'excedido';
  if (percent >= 80) return 'atencion';
  return 'ok';
}

export async function getBudget(
  companyId: string,
  condominiumId: string,
  year: number
): Promise<BudgetSummary> {
  return withTenantContext(companyId, async (tx) => {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const prevFrom = new Date(Date.UTC(year - 1, 0, 1));

    const [accounts, lines, expenses] = await Promise.all([
      tx.chartOfAccount.findMany({
        where: { condominiumId, type: 'gasto' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      tx.budgetLine.findMany({ where: { condominiumId, period: String(year) } }),
      // Solo gasto real: lo aprobado o pagado. Un borrador todavía no
      // es gasto del condominio.
      tx.expense.findMany({
        where: {
          condominiumId,
          status: { in: ['aprobado', 'pagado'] },
          issueDate: { gte: prevFrom, lt: to },
        },
        select: { accountCode: true, total: true, issueDate: true },
      }),
    ]);

    const budgetByAccount = new Map(lines.map((l) => [l.accountId, Number(l.budgetedAmount)]));

    const executedByCode = new Map<string, number>();
    const lastYearByCode = new Map<string, number>();
    for (const e of expenses) {
      const target = e.issueDate >= from ? executedByCode : lastYearByCode;
      target.set(e.accountCode, (target.get(e.accountCode) ?? 0) + Number(e.total));
    }

    // Cuánto del año va transcurrido: si estamos en julio y una
    // partida va en 90 %, hay un problema aunque no haya llegado a 100.
    const now = new Date();
    const yearProgress =
      now.getUTCFullYear() > year
        ? 1
        : now.getUTCFullYear() < year
          ? 0
          : (now.getTime() - from.getTime()) / (to.getTime() - from.getTime());

    const rows: BudgetRow[] = accounts.map((a) => {
      const budgeted = budgetByAccount.get(a.id) ?? 0;
      const executed = round2(executedByCode.get(a.code) ?? 0);
      const lastYear = round2(lastYearByCode.get(a.code) ?? 0);
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        budgeted: round2(budgeted),
        executed,
        available: round2(budgeted - executed),
        percent: budgeted > 0 ? round2((executed / budgeted) * 100) : 0,
        lastYear,
        // Sugerencia: el gasto real del año anterior con un ajuste
        // conservador del 5 %. Es un punto de partida, no una verdad.
        suggested: round2(lastYear * 1.05),
      };
    });

    const totalBudgeted = round2(rows.reduce((s, r) => s + r.budgeted, 0));
    const totalExecuted = round2(rows.reduce((s, r) => s + r.executed, 0));

    return {
      rows,
      totalBudgeted,
      totalExecuted,
      yearProgress: Math.min(1, Math.max(0, yearProgress)),
      overBudget: rows.filter((r) => r.budgeted > 0 && r.percent >= 100),
    };
  });
}

export async function saveBudget(
  companyId: string,
  condominiumId: string,
  year: number,
  amounts: { accountId: string; amount: number }[]
) {
  return withTenantContext(companyId, async (tx) => {
    for (const { accountId, amount } of amounts) {
      if (amount > 0) {
        await tx.budgetLine.upsert({
          where: { condominiumId_accountId_period: { condominiumId, accountId, period: String(year) } },
          create: { condominiumId, accountId, period: String(year), budgetedAmount: amount },
          update: { budgetedAmount: amount },
        });
      } else {
        // Una partida en cero se borra: no tiene sentido guardar
        // presupuestos vacíos que ensucien el comparativo.
        await tx.budgetLine
          .delete({
            where: { condominiumId_accountId_period: { condominiumId, accountId, period: String(year) } },
          })
          .catch(() => undefined);
      }
    }
  });
}

/** Años que ya tienen presupuesto cargado. */
export async function listBudgetYears(companyId: string, condominiumId: string): Promise<number[]> {
  return withTenantContext(companyId, async (tx) => {
    const lines = await tx.budgetLine.findMany({
      where: { condominiumId },
      select: { period: true },
      distinct: ['period'],
    });
    const years = lines.map((l) => Number(l.period)).filter((n) => Number.isFinite(n));
    const current = new Date().getUTCFullYear();
    if (!years.includes(current)) years.push(current);
    return years.sort((a, b) => b - a);
  });
}
