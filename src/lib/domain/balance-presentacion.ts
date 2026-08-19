/**
 * Cómo se PRESENTA un saldo del balance de situación.
 *
 * La vista `v_balance_general` calcula `débito − crédito` para todas
 * las cuentas, que es lo correcto para la partida doble pero no para
 * enseñárselo a alguien: pasivo y patrimonio llevan saldo ACREEDOR, así
 * que salen en negativo. En pantalla se leía "Proveedores por Pagar
 * −₡520 000", como si la administración tuviera un saldo a favor.
 *
 * El PDF de estados financieros ya lo resolvía por su cuenta
 * (`contabilidad/eeff/route.ts`: "Pasivo y patrimonio llevan saldo
 * acreedor: se presentan en positivo"), pero las dos PANTALLAS que leen
 * la misma vista —`/app/contabilidad` y `Reportes → Resumen`— mostraban
 * el número crudo. Tres consumidores de la misma vista, dos criterios
 * distintos. Esta función es el criterio único.
 *
 * No se toca la vista ni el signo almacenado: el cálculo contable sigue
 * siendo `débito − crédito`. Esto es solo presentación.
 */

/** Tipos cuyo saldo natural es acreedor y por lo tanto se invierten al mostrar. */
const ACREEDORAS = new Set(['pasivo', 'patrimonio', 'ingreso']);

export function saldoParaMostrar(type: string, balance: number): number {
  return ACREEDORAS.has(type) ? -balance : balance;
}

/**
 * ¿El balance cuadra? Activo = Pasivo + Patrimonio, con los saldos ya
 * presentados. Se compara con tolerancia de un céntimo porque los
 * decimales de Postgres y los de JavaScript no siempre coinciden al
 * último dígito.
 */
export function balanceCuadra(
  filas: { type: string; balance: number }[]
): { activo: number; pasivoMasPatrimonio: number; cuadra: boolean } {
  let activo = 0;
  let pasivoMasPatrimonio = 0;
  for (const f of filas) {
    const v = saldoParaMostrar(f.type, f.balance);
    if (f.type === 'activo') activo += v;
    else if (f.type === 'pasivo' || f.type === 'patrimonio') pasivoMasPatrimonio += v;
  }
  return { activo, pasivoMasPatrimonio, cuadra: Math.abs(activo - pasivoMasPatrimonio) < 0.01 };
}
