/**
 * Reglas puras de partida doble — sin dependencia de Prisma ni de
 * base de datos, para poder probarlas de forma aislada y rápida.
 * src/lib/services/accounting.ts las usa antes de escribir cualquier
 * asiento; prisma/sql/01_views_functions_triggers.sql las repite como
 * última defensa a nivel de base de datos (check_journal_balance).
 */

export type JournalLineInput = { accountCode: string; debit?: number; credit?: number };

export type BalanceCheckResult = { balanced: boolean; totalDebit: number; totalCredit: number; error?: string };

/**
 * Un asiento cuadra si la suma de débitos es exactamente igual a la
 * suma de créditos, y cada línea individual es débito O crédito
 * (nunca ambos, nunca ninguno). Se redondea a centavos para evitar
 * falsos negativos por errores de punto flotante (ej. 0.1 + 0.2).
 */
export function checkJournalBalance(lines: JournalLineInput[]): BalanceCheckResult {
  if (lines.length === 0) {
    return { balanced: false, totalDebit: 0, totalCredit: 0, error: 'Un asiento necesita al menos una línea' };
  }

  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;
    if (debit > 0 && credit > 0) {
      return { balanced: false, totalDebit: 0, totalCredit: 0, error: `La cuenta ${line.accountCode} no puede tener débito y crédito a la vez` };
    }
    if (debit === 0 && credit === 0) {
      return { balanced: false, totalDebit: 0, totalCredit: 0, error: `La cuenta ${line.accountCode} necesita un monto en débito o crédito` };
    }
  }

  const totalDebit = round2(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const totalCredit = round2(lines.reduce((s, l) => s + (l.credit ?? 0), 0));
  const balanced = totalDebit === totalCredit;

  return {
    balanced,
    totalDebit,
    totalCredit,
    error: balanced ? undefined : `Asiento descuadrado: débitos ${totalDebit} distintos de créditos ${totalCredit}`,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
