import { withTenantContext } from '@/lib/db';
import { buildAging } from '@/lib/domain/aging';
import { projectSpent, EXPENSE_EXECUTED } from '@/lib/services/projects';
import { getExpenseLedger } from '@/lib/services/expense-ledger';
import { EXECUTED_EXPENSE_STATUSES } from '@/lib/services/expenses';
import { getEstadoResultadosRango } from '@/lib/services/accounting';
import type { ExpenseStatus } from '@prisma/client';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Reportes consolidados multi-condominio. Reutiliza los mismos
 * modelos que ya usan Finanzas/Mantenimiento/Proyectos — no duplica
 * ninguna lógica de negocio, solo agrega para varios condominios a la
 * vez. Nunca suma montos de condominios con monedas distintas (CRC
 * vs. USD) en un mismo total — se agrupan por moneda, igual regla que
 * ya aplicaba el prototipo.
 *
 * `condoIds`, cuando se pasa, recorta el consolidado a esos
 * condominios — lo usa la pantalla para pasar
 * `listCondominiumsForSession(session)`, que ya devuelve TODOS los
 * condominios para `admin_owner`/`contador` y solo los asignados para
 * `admin_staff` (auditoría de seguridad 2026-08-11, hallazgo #16: un
 * supervisor veía la morosidad de condominios que no administra).
 * Sin `condoIds` (nadie lo pasa así hoy) el consolidado sigue siendo
 * de toda la empresa, como antes.
 */

export async function getFinancialReport(companyId: string, condoIds?: string[]) {
  return withTenantContext(companyId, async (tx) => {
    const condos = await tx.condominium.findMany({
      where: { status: 'activo', deletedAt: null, ...(condoIds ? { id: { in: condoIds } } : {}) },
    });
    const rows = await Promise.all(
      condos.map(async (c) => {
        const charges = await tx.charge.aggregate({
          where: { condominiumId: c.id, status: { not: 'anulado' } },
          _sum: { amount: true },
        });
        const allocations = await tx.paymentAllocation.aggregate({
          where: { charge: { condominiumId: c.id }, payment: { status: 'aplicado' } },
          _sum: { amount: true },
        });
        const billed = Number(charges._sum.amount ?? 0);
        const collected = Number(allocations._sum.amount ?? 0);
        return { condoId: c.id, condoName: c.name, currency: c.currency, billed, collected, pct: billed ? Math.round((collected / billed) * 100) : 0 };
      })
    );
    return rows;
  });
}

export async function getDelinquencyReport(companyId: string, condoIds?: string[]) {
  return withTenantContext(companyId, async (tx) => {
    const properties = await tx.property.findMany({
      where: {
        condominium: { status: 'activo', deletedAt: null },
        ...(condoIds ? { condominiumId: { in: condoIds } } : {}),
      },
      include: { condominium: { select: { name: true, currency: true } } },
    });

    // Antes esta función reimplementaba desde cero el saldo y los días
    // de atraso (sumando solo lo YA vencido, sin `round2`), y daba una
    // cifra DISTINTA a `Finanzas → Cobranza` para la misma filial el
    // mismo día — hasta ₡ de diferencia si la filial tenía además un
    // cargo próximo a vencer, y hasta un día de diferencia en si una
    // filial con vencimiento HOY ya contaba como morosa (auditoría de
    // Finanzas Etapa 2, Fase 3, hallazgo 3.1). Ahora usa `buildAging`,
    // la misma fuente de verdad que `getCollectionsView` — un solo
    // cálculo de morosidad en todo el sistema, ya probado en
    // `aging.test.ts`.
    const propertyIds = properties.map((p) => p.id);
    const charges = await tx.charge.findMany({
      where: { propertyId: { in: propertyIds }, status: { in: ['pendiente', 'parcial'] } },
      select: {
        propertyId: true,
        amount: true,
        dueDate: true,
        allocations: { where: { payment: { status: 'aplicado' } }, select: { amount: true } },
      },
    });

    const aging = buildAging(
      charges.map((c) => ({
        propertyId: c.propertyId,
        outstanding: round2(Number(c.amount) - c.allocations.reduce((s, a) => s + Number(a.amount), 0)),
        dueDate: c.dueDate,
      })),
      new Date()
    );
    const byProperty = new Map(aging.byProperty.map((p) => [p.propertyId, p]));

    return properties
      .filter((p) => (byProperty.get(p.id)?.oldestDays ?? 0) > 0)
      .map((p) => {
        const a = byProperty.get(p.id)!;
        return { propertyCode: p.code, condoName: p.condominium.name, currency: p.condominium.currency, balance: a.total, daysOverdue: a.oldestDays };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
  });
}

export async function getMaintenanceReport(companyId: string, condoIds?: string[]) {
  return withTenantContext(companyId, async (tx) => {
    const tickets = await tx.maintenanceTicket.findMany({
      where: {
        condominium: { status: 'activo', deletedAt: null },
        ...(condoIds ? { condominiumId: { in: condoIds } } : {}),
      },
      include: { condominium: { select: { name: true, currency: true } } },
    });
    const byStatus: Record<string, number> = {};
    let totalCost = 0;
    for (const t of tickets) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.cost) totalCost += Number(t.cost);
    }
    return { total: tickets.length, byStatus, totalCost, preventivos: tickets.filter((t) => t.ticketType === 'preventivo').length };
  });
}

/**
 * Lo gastado de cada proyecto sale de `projectSpent`, la MISMA función
 * que usa el tablero de Proyectos — no de una suma propia.
 *
 * Antes este reporte sumaba únicamente `ProjectExpense`, el módulo de
 * gastos de proyecto que se retiró cuando ese trabajo pasó a Finanzas
 * (ver `Expense.projectId` en el esquema). Resultado: un proyecto
 * financiado por la vía actual —un gasto de Finanzas imputado al
 * proyecto— aparecía con "Gastado ₡0" en Reportes mientras el módulo
 * de Proyectos mostraba el monto real, para el mismo proyecto el mismo
 * día (auditoría de la Etapa 7, hallazgo 7.1).
 */
export async function getProjectsReport(companyId: string, condoIds?: string[]) {
  return withTenantContext(companyId, async (tx) => {
    const projects = await tx.project.findMany({
      where: {
        condominium: { status: 'activo', deletedAt: null },
        ...(condoIds ? { condominiumId: { in: condoIds } } : {}),
      },
      include: {
        condominium: { select: { name: true, currency: true } },
        // Las dos fuentes que reconoce el módulo: el historial heredado
        // y los gastos de Finanzas imputados al proyecto (solo los que
        // ya cuentan como ejecución — `EXPENSE_EXECUTED`).
        expenses: { select: { amount: true } },
        financeExpenses: { where: { status: { in: [...EXPENSE_EXECUTED] } }, select: { total: true } },
      },
    });
    return projects.map((p) => ({
      name: p.name,
      condoName: p.condominium.name,
      currency: p.condominium.currency,
      status: p.status,
      budget: Number(p.budget),
      spent: round2(projectSpent(p)),
    }));
  });
}

/**
 * Egresos de un condominio en un año — el reporte y su cuadre.
 *
 * Devuelve tres cosas que tienen que ser consistentes entre sí:
 *
 *   · `lines`  — el detalle factura por factura del módulo de Gastos,
 *                exactamente las mismas filas que `Finanzas → Gastos`.
 *   · `ledger` — TODO el gasto contabilizado del año, desglosado por
 *                origen (`expense-ledger.ts`): el módulo de Gastos más
 *                la depreciación, los tickets de mantenimiento y los
 *                gastos de proyecto, que también son gasto del
 *                condominio y nunca pasaron por el módulo.
 *   · `descuadre` — la diferencia entre el detalle y lo que el libro
 *                diario le atribuye al módulo de Gastos. Debe ser 0;
 *                si no lo es, hay un gasto sin asiento (o al revés) y
 *                la pantalla lo dice en vez de callarlo.
 *
 * `ledger.total` es el número que usan tanto esta pestaña como
 * "Resumen financiero" para los egresos del año: uno solo, no dos.
 */
export async function getEgresosReport(companyId: string, condominiumId: string, year: number) {
  return withTenantContext(companyId, async (tx) => {
    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

    const [ledger, lines] = await Promise.all([
      getExpenseLedger(tx, condominiumId, from, to),
      tx.expense.findMany({
        where: {
          condominiumId,
          status: { in: EXECUTED_EXPENSE_STATUSES as unknown as ExpenseStatus[] },
          issueDate: { gte: from, lte: to },
        },
        orderBy: [{ issueDate: 'desc' }, { expenseNumber: 'desc' }],
        include: { supplier: { select: { legalName: true, tradeName: true } } },
      }),
    ]);

    const totalLines = round2(lines.reduce((s, e) => s + Number(e.total), 0));
    return {
      year,
      lines,
      totalLines,
      ledger,
      descuadre: round2(ledger.totalModulo - totalLines),
    };
  });
}

/**
 * Resumen financiero de un condominio en un año: ingresos y egresos
 * del libro diario — la MISMA fuente para los dos lados, para que el
 * resultado sea el resultado contable y no una resta entre dos
 * orígenes distintos.
 */
export async function getResumenFinanciero(companyId: string, condominiumId: string, year: number) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const [resultados, egresos] = await Promise.all([
    getEstadoResultadosRango(companyId, condominiumId, from, to),
    getEgresosReport(companyId, condominiumId, year),
  ]);
  const ingresosRows = resultados.filter((r) => r.type === 'ingreso');
  const totalIngresos = round2(ingresosRows.reduce((s, r) => s + Number(r.balance), 0));
  return {
    year,
    ingresosRows,
    totalIngresos,
    totalEgresos: egresos.ledger.total,
    egresosPorOrigen: egresos.ledger.byOrigin,
    resultado: round2(totalIngresos - egresos.ledger.total),
  };
}
