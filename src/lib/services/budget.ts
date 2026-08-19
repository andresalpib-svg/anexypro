import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { getExpenseLedger } from '@/lib/services/expense-ledger';
import { logActivity } from '@/lib/services/audit';
import { logChange, type CambioCampo } from '@/lib/services/audit-trail';

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

    const lastDay = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const prevLastDay = new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59));

    const [accounts, lines, ejecutado, anterior] = await Promise.all([
      tx.chartOfAccount.findMany({
        where: { condominiumId, type: 'gasto' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      tx.budgetLine.findMany({ where: { condominiumId, period: String(year) } }),
      // El ejecutado sale del LIBRO DIARIO, no del módulo de Gastos:
      // es la misma fuente que usan el Estado de Resultados y
      // `Reportes → Egresos` (ver `expense-ledger.ts`). Antes sumaba
      // solo `Expense`, y por eso una partida como "Mantenimiento
      // General" mostraba ₡0 ejecutado mientras un ticket completado ya
      // había consumido su presupuesto — el administrador creía tener
      // disponible un dinero que ya estaba gastado (auditoría de la
      // Etapa 7, hallazgo 7.2).
      //
      // El criterio "solo lo aprobado o pagado" no cambia: un gasto en
      // borrador o por aprobar no tiene asiento, y uno anulado tiene el
      // suyo marcado como anulado.
      getExpenseLedger(tx, condominiumId, from, lastDay),
      getExpenseLedger(tx, condominiumId, prevFrom, prevLastDay),
    ]);

    const budgetByAccount = new Map(lines.map((l) => [l.accountId, Number(l.budgetedAmount)]));
    const executedByCode = ejecutado.byAccountCode;
    const lastYearByCode = anterior.byAccountCode;

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

/**
 * Guarda el presupuesto del año.
 *
 * Deja rastro de CADA partida que cambió, con lo que decía antes y lo
 * que dice ahora (Etapa 8). Bajar una partida de ₡2 000 000 a ₡200 000
 * es la clase de cambio que después nadie recuerda haber hecho, y la
 * bitácora de actividad sola —"presupuesto guardado"— no alcanza para
 * reconstruirlo.
 */
export async function saveBudget(
  companyId: string,
  condominiumId: string,
  year: number,
  amounts: { accountId: string; amount: number }[],
  user?: { id: string; name: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const period = String(year);
    const previas = await tx.budgetLine.findMany({
      where: { condominiumId, period, accountId: { in: amounts.map((a) => a.accountId) } },
      select: { accountId: true, budgetedAmount: true, account: { select: { code: true, name: true } } },
    });
    const antesPorCuenta = new Map(previas.map((l) => [l.accountId, l]));
    const cambios: CambioCampo[] = [];

    for (const { accountId, amount } of amounts) {
      const previa = antesPorCuenta.get(accountId);
      const antes = previa ? Number(previa.budgetedAmount) : 0;
      if (round2(antes) !== round2(amount)) {
        const etiqueta = previa ? `${previa.account.code} · ${previa.account.name}` : accountId;
        cambios.push({ campo: etiqueta, antes: round2(antes), despues: round2(amount) });
      }

      if (amount > 0) {
        await tx.budgetLine.upsert({
          where: { condominiumId_accountId_period: { condominiumId, accountId, period } },
          create: { condominiumId, accountId, period, budgetedAmount: amount },
          update: { budgetedAmount: amount },
        });
      } else {
        // Una partida en cero se borra: no tiene sentido guardar
        // presupuestos vacíos que ensucien el comparativo. Lo que valía
        // antes queda en el rastro de auditoría de acá abajo, así que
        // borrar la fila ya no pierde información.
        await tx.budgetLine
          .delete({ where: { condominiumId_accountId_period: { condominiumId, accountId, period } } })
          .catch(() => undefined);
      }
    }

    if (cambios.length > 0 && user) {
      await logChange(tx, companyId, {
        entity: 'budget_lines',
        entityId: `${condominiumId}:${period}`,
        condominiumId,
        action: 'actualizar',
        userId: user.id,
        cambios,
      });
      await logActivity(tx, companyId, {
        userId: user.id,
        userName: user.name,
        module: 'Finanzas',
        action: `Presupuesto ${period} modificado`,
        target: `${cambios.length} partida(s): ${cambios
          .slice(0, 3)
          .map((c) => `${c.campo} ₡${Number(c.antes).toLocaleString('es-CR')} → ₡${Number(c.despues).toLocaleString('es-CR')}`)
          .join(' · ')}${cambios.length > 3 ? ' …' : ''}`,
      });
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
