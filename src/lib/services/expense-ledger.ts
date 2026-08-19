import type { Prisma } from '@prisma/client';
import { buildExpenseLedger, type EgresoLedger } from '@/lib/domain/expense-ledger';

export { EGRESO_ORIGENES, ORIGEN_OTROS, egresoHref } from '@/lib/domain/expense-ledger';
export type { EgresoLedger, EgresoOrigen } from '@/lib/domain/expense-ledger';

/**
 * EL gasto del condominio — una sola definición para todo el sistema.
 *
 * Etapa 7 encontró que "cuánto gastó este condominio" se respondía de
 * dos maneras distintas según la pantalla:
 *
 *   · `Presupuesto → Ejecutado` y `Reportes → Egresos` sumaban el
 *     módulo de Gastos (`Expense` en estado aprobado/pagado).
 *   · `Reportes → Depreciaciones`, `Reportes → Mantenimiento` y el
 *     Estado de Resultados sumaban el libro diario.
 *
 * Y el libro diario tiene gasto que NUNCA pasa por el módulo de
 * Gastos: la depreciación mensual de los activos (cuenta 5902) y el
 * costo de un ticket de mantenimiento completado (cuenta 5003). En una
 * prueba con datos controlados la diferencia fue de ₡84 000 sobre
 * ₡514 000 — un 16 % del gasto del año que "Resumen financiero" no
 * mostraba, mientras la pestaña de al lado sí lo mostraba. Peor en
 * Presupuesto: la partida "Mantenimiento General" aparecía con ₡0
 * ejecutado aunque un ticket ya se hubiera comido su presupuesto.
 *
 * Desde acá hay UNA fuente: los asientos confirmados contra cuentas de
 * tipo `gasto`. El desglose por origen no cambia el total, solo dice de
 * dónde viene cada parte — así `Reportes → Egresos` sigue enseñando el
 * detalle factura por factura del módulo de Gastos (y su subtotal
 * cuadra con `Finanzas → Gastos`) sin dejar de sumar el resto.
 *
 * Un gasto anulado no cuenta: `voidExpense` marca su asiento como
 * `anulado` y esta consulta solo lee `confirmado`. Un borrador o un
 * gasto por aprobar tampoco: todavía no tienen asiento.
 */

/**
 * Gasto contabilizado de un condominio entre dos fechas (ambas
 * incluidas), por cuenta y por origen.
 *
 * Recibe `tx` en vez de abrir su propia transacción para que quien ya
 * está dentro de una —`getBudget`, por ejemplo— no pague una segunda.
 *
 * Replica la única regla de `v_libro_mayor` que importa acá
 * (`status = 'confirmado'`) en vez de leer la vista, porque la vista no
 * expone `source_table` y ampliarla obligaría a desplegar SQL suelto —
 * el punto flojo que ya señaló la auditoría funcional de agosto.
 */
export async function getExpenseLedger(
  tx: Prisma.TransactionClient,
  condominiumId: string,
  from: Date,
  to: Date
): Promise<EgresoLedger> {
  const lines = await tx.journalLine.findMany({
    where: {
      account: { condominiumId, type: 'gasto' },
      entry: { condominiumId, status: 'confirmado', entryDate: { gte: from, lte: to } },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { code: true } },
      entry: { select: { sourceTable: true } },
    },
  });

  return buildExpenseLedger(
    lines.map((l) => ({
      debit: l.debit,
      credit: l.credit,
      accountCode: l.account.code,
      sourceTable: l.entry.sourceTable,
    }))
  );
}
