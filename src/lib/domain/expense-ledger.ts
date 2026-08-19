import { round2 } from './late-interest';

/**
 * Agregación del gasto contabilizado — la parte sin base de datos.
 *
 * `services/expense-ledger.ts` trae los renglones del libro diario que
 * tocan cuentas de tipo `gasto` y esta función los reparte en dos
 * cortes del MISMO total: por cuenta contable (lo que ejecuta cada
 * partida del presupuesto) y por origen (de qué módulo salió). Que los
 * dos cortes sumen lo mismo no es casualidad: es la propiedad que hace
 * que `Presupuesto → Ejecutado` y `Reportes → Egresos` no puedan
 * separarse nunca, y por eso se prueba.
 */

/** De qué parte del sistema nació el asiento. El orden es el de presentación. */
export const EGRESO_ORIGENES = [
  { sourceTable: 'expenses', label: 'Módulo de Gastos', href: '/app/finanzas/gastos' },
  { sourceTable: 'maintenance_tickets', label: 'Mantenimiento (tickets completados)', href: '/app/mantenimiento' },
  { sourceTable: 'project_expenses', label: 'Proyectos', href: '/app/proyectos' },
  { sourceTable: 'asset_depreciation_entries', label: 'Depreciación de activos', href: '/app/activos' },
] as const;

/** Cajón para lo que no nació de ningún módulo conocido (ajustes, asientos manuales). */
export const ORIGEN_OTROS = 'otros';

const LABEL_POR_TABLA = new Map<string, string>(EGRESO_ORIGENES.map((o) => [o.sourceTable, o.label]));
const HREF_POR_TABLA = new Map<string, string>(EGRESO_ORIGENES.map((o) => [o.sourceTable, o.href]));

export type EgresoLine = {
  debit: unknown;
  credit: unknown;
  accountCode: string;
  sourceTable: string | null;
};

export type EgresoOrigen = {
  sourceTable: string;
  label: string;
  href?: string;
  total: number;
};

export type EgresoLedger = {
  /** Gasto del período por código de cuenta contable — lo que ejecuta el presupuesto. */
  byAccountCode: Map<string, number>;
  /** El mismo total, desglosado por de dónde vino. */
  byOrigin: EgresoOrigen[];
  /** Total contabilizado del período. `byAccountCode` y `byOrigin` suman esto. */
  total: number;
  /** La parte que sí nació en el módulo de Gastos — cuadra con `Finanzas → Gastos`. */
  totalModulo: number;
};

export function buildExpenseLedger(lines: EgresoLine[]): EgresoLedger {
  const byAccountCode = new Map<string, number>();
  const porOrigen = new Map<string, number>();

  for (const l of lines) {
    // Un gasto es débito; un crédito contra una cuenta de gasto es una
    // devolución o una corrección y RESTA. Mismo signo que usa
    // `v_estado_resultados`, para que los dos den el mismo número.
    const monto = Number(l.debit ?? 0) - Number(l.credit ?? 0);
    byAccountCode.set(l.accountCode, (byAccountCode.get(l.accountCode) ?? 0) + monto);
    const tabla = l.sourceTable && LABEL_POR_TABLA.has(l.sourceTable) ? l.sourceTable : ORIGEN_OTROS;
    porOrigen.set(tabla, (porOrigen.get(tabla) ?? 0) + monto);
  }

  for (const [code, monto] of byAccountCode) byAccountCode.set(code, round2(monto));

  const byOrigin: EgresoOrigen[] = [];
  for (const o of EGRESO_ORIGENES) {
    const total = round2(porOrigen.get(o.sourceTable) ?? 0);
    // Una cuenta en cero no aporta nada al desglose y solo alarga la tabla.
    if (total !== 0) byOrigin.push({ sourceTable: o.sourceTable, label: o.label, href: o.href, total });
  }
  const otros = round2(porOrigen.get(ORIGEN_OTROS) ?? 0);
  if (otros !== 0) byOrigin.push({ sourceTable: ORIGEN_OTROS, label: 'Ajustes contables', total: otros });

  return {
    byAccountCode,
    byOrigin,
    total: round2(byOrigin.reduce((s, o) => s + o.total, 0)),
    totalModulo: round2(porOrigen.get('expenses') ?? 0),
  };
}

/** Enlace al módulo que originó un egreso, cuando lo tiene. */
export function egresoHref(sourceTable: string): string | undefined {
  return HREF_POR_TABLA.get(sourceTable);
}
