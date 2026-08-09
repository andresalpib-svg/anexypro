import { describe, it, expect } from 'vitest';
import { projectSpent, EXPENSE_EXECUTED } from '@/lib/services/projects';

describe('projectSpent — lo ejecutado de un proyecto', () => {
  it('suma las dos fuentes: el módulo retirado y los gastos de Finanzas', () => {
    // `expenses` es el historial de ProjectExpense, que ya no se
    // alimenta pero sigue contando; `financeExpenses` es la vía actual.
    const total = projectSpent({
      expenses: [{ amount: 1_200_000 }, { amount: 1_250_000 }],
      financeExpenses: [{ total: 450_000 }],
    });
    expect(total).toBe(2_900_000);
  });

  it('un proyecto sin ejecución da cero, no NaN', () => {
    expect(projectSpent({ expenses: [], financeExpenses: [] })).toBe(0);
    expect(projectSpent({})).toBe(0);
    expect(projectSpent({ expenses: null, financeExpenses: null })).toBe(0);
  });

  it('acepta los Decimal de Prisma, que llegan como objeto', () => {
    // Prisma devuelve Decimal; `Number()` es lo que los convierte.
    const decimal = (v: string) => ({ toString: () => v, valueOf: () => Number(v) });
    expect(projectSpent({ financeExpenses: [{ total: decimal('450000') }] })).toBe(450_000);
  });

  it('solo lo aprobado o pagado cuenta como ejecución', () => {
    // La lista se usa en el `where` de la consulta y en el detalle para
    // marcar cuáles cuentan: si cambia, los dos lugares cambian juntos.
    expect([...EXPENSE_EXECUTED]).toEqual(['aprobado', 'pagado']);
    expect(EXPENSE_EXECUTED).not.toContain('borrador');
    expect(EXPENSE_EXECUTED).not.toContain('por_aprobar');
    expect(EXPENSE_EXECUTED).not.toContain('anulado');
  });
});
