import { describe, it, expect } from 'vitest';
import { buildExpenseLedger, egresoHref, type EgresoLine } from '@/lib/domain/expense-ledger';

const linea = (accountCode: string, debit: number, sourceTable: string | null, credit = 0): EgresoLine => ({
  accountCode,
  debit,
  credit,
  sourceTable,
});

describe('buildExpenseLedger — el gasto del condominio, una sola vez', () => {
  it('los dos cortes (por cuenta y por origen) suman exactamente lo mismo', () => {
    // Es LA propiedad que sostiene la Etapa 7: "Ejecutado" del
    // presupuesto sale del corte por cuenta y el total de Egresos del
    // corte por origen. Si estos dos números se separaran, las dos
    // pantallas volverían a contradecirse.
    const l = buildExpenseLedger([
      linea('5303', 200_000, 'expenses'),
      linea('5001', 80_000, 'expenses'),
      linea('5003', 44_000, 'maintenance_tickets'),
      linea('5902', 40_000, 'asset_depreciation_entries'),
    ]);
    const porCuenta = [...l.byAccountCode.values()].reduce((s, v) => s + v, 0);
    const porOrigen = l.byOrigin.reduce((s, o) => s + o.total, 0);
    expect(porCuenta).toBe(364_000);
    expect(porOrigen).toBe(364_000);
    expect(l.total).toBe(364_000);
  });

  it('separa lo que vino del módulo de Gastos de lo que no', () => {
    const l = buildExpenseLedger([
      linea('5303', 200_000, 'expenses'),
      linea('5003', 44_000, 'maintenance_tickets'),
      linea('5902', 40_000, 'asset_depreciation_entries'),
    ]);
    // `totalModulo` es lo que tiene que cuadrar con Finanzas → Gastos.
    expect(l.totalModulo).toBe(200_000);
    expect(l.total - l.totalModulo).toBe(84_000);
  });

  it('la depreciación y el mantenimiento ejecutan SU partida, no la del módulo', () => {
    const l = buildExpenseLedger([
      linea('5003', 10_000, 'expenses'),
      linea('5003', 44_000, 'maintenance_tickets'),
      linea('5902', 40_000, 'asset_depreciation_entries'),
    ]);
    // Antes de la Etapa 7 la partida 5003 mostraba 10 000 ejecutados
    // mientras el ticket ya se había comido 44 000 más.
    expect(l.byAccountCode.get('5003')).toBe(54_000);
    expect(l.byAccountCode.get('5902')).toBe(40_000);
  });

  it('un crédito contra una cuenta de gasto RESTA (devolución o corrección)', () => {
    const l = buildExpenseLedger([
      linea('5303', 200_000, 'expenses'),
      linea('5303', 0, 'expenses', 50_000),
    ]);
    expect(l.byAccountCode.get('5303')).toBe(150_000);
    expect(l.total).toBe(150_000);
  });

  it('un origen desconocido cae en "Ajustes contables" y sigue sumando', () => {
    const l = buildExpenseLedger([linea('5500', 12_000, null), linea('5500', 3_000, 'tabla_que_no_existe')]);
    expect(l.byOrigin).toEqual([{ sourceTable: 'otros', label: 'Ajustes contables', total: 15_000 }]);
    expect(l.total).toBe(15_000);
  });

  it('no lista orígenes en cero — la tabla enseña solo lo que ocurrió', () => {
    const l = buildExpenseLedger([linea('5303', 200_000, 'expenses')]);
    expect(l.byOrigin.map((o) => o.sourceTable)).toEqual(['expenses']);
  });

  it('los orígenes salen en orden de presentación, no en el de llegada', () => {
    const l = buildExpenseLedger([
      linea('5902', 40_000, 'asset_depreciation_entries'),
      linea('5303', 200_000, 'expenses'),
      linea('5003', 44_000, 'maintenance_tickets'),
    ]);
    expect(l.byOrigin.map((o) => o.sourceTable)).toEqual([
      'expenses',
      'maintenance_tickets',
      'asset_depreciation_entries',
    ]);
  });

  it('sin movimientos da cero, no NaN ni undefined', () => {
    const l = buildExpenseLedger([]);
    expect(l.total).toBe(0);
    expect(l.totalModulo).toBe(0);
    expect(l.byOrigin).toEqual([]);
    expect(l.byAccountCode.size).toBe(0);
  });

  it('acepta los Decimal de Prisma, que llegan como objeto', () => {
    const decimal = (v: string) => ({ toString: () => v, valueOf: () => Number(v) });
    const l = buildExpenseLedger([
      { accountCode: '5303', debit: decimal('200000.50'), credit: decimal('0'), sourceTable: 'expenses' },
    ]);
    expect(l.total).toBe(200_000.5);
  });

  it('cada origen conocido enlaza a su módulo', () => {
    expect(egresoHref('expenses')).toBe('/app/finanzas/gastos');
    expect(egresoHref('asset_depreciation_entries')).toBe('/app/activos');
    expect(egresoHref('otros')).toBeUndefined();
  });
});
