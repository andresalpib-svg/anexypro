import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { getCashFlow } from '@/lib/services/cash-flow';
import { getCollectionsView } from '@/lib/services/collections';
import { getBudget, budgetAlert } from '@/lib/services/budget';
import { listBankAccountsWithBalance } from '@/lib/services/bank-accounts';
import { getReserveFund } from '@/lib/services/reserve-fund';

/**
 * Panel financiero.
 *
 * Regla de diseño: lo que EXIGE ACCIÓN va primero. Un panel que
 * obliga a buscar el problema entre gráficos ya fracasó, así que las
 * alertas se calculan aquí y se muestran arriba de todo.
 */

export type Alert = {
  level: 'critico' | 'atencion' | 'info';
  title: string;
  detail: string;
  href: string;
};

export type Indicator = {
  key: string;
  label: string;
  value: string;
  status: 'ok' | 'warn' | 'danger' | 'neutral';
  hint: string;
};

export async function getFinancialDashboard(companyId: string, condominiumId: string) {
  const today = new Date();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));

  const [cashFlow, collections, budget, banks, reserve, operational] = await Promise.all([
    getCashFlow(companyId, condominiumId, { history: 12, forecast: 6 }),
    getCollectionsView(companyId, condominiumId, today),
    getBudget(companyId, condominiumId, today.getUTCFullYear()),
    listBankAccountsWithBalance(companyId, condominiumId),
    getReserveFund(companyId, condominiumId),
    withTenantContext(companyId, async (tx) => {
      const [income, prevIncome, expense, prevExpense, pendingApproval, payable, contracts, unreconciled] =
        await Promise.all([
          tx.payment.aggregate({
            where: { condominiumId, status: 'aplicado', paymentDate: { gte: monthStart } },
            _sum: { amount: true },
          }),
          tx.payment.aggregate({
            where: { condominiumId, status: 'aplicado', paymentDate: { gte: prevStart, lt: monthStart } },
            _sum: { amount: true },
          }),
          tx.expense.aggregate({
            where: {
              condominiumId,
              status: { in: ['aprobado', 'pagado'] },
              issueDate: { gte: monthStart },
            },
            _sum: { total: true },
          }),
          tx.expense.aggregate({
            where: {
              condominiumId,
              status: { in: ['aprobado', 'pagado'] },
              issueDate: { gte: prevStart, lt: monthStart },
            },
            _sum: { total: true },
          }),
          // SOLO `por_aprobar`. Un borrador no espera aprobación: nadie
          // lo ha enviado todavía. Incluirlo hacía que el panel dijera
          // "1 esperan aprobación" mientras la pestaña Gastos —que sí
          // filtra— decía 0, sobre el mismo gasto.
          tx.expense.findMany({
            where: { condominiumId, status: 'por_aprobar' },
            select: { id: true, expenseNumber: true, description: true, total: true, status: true },
            orderBy: { issueDate: 'asc' },
            take: 10,
          }),
          tx.expense.findMany({
            where: { condominiumId, status: 'aprobado' },
            select: { id: true, expenseNumber: true, description: true, total: true, dueDate: true, payments: { select: { amount: true } } },
            orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
            take: 10,
          }),
          tx.contract.findMany({
            where: { condominiumId, status: { in: ['por_vencer', 'vencido'] } },
            select: { id: true, title: true, endDate: true, status: true, supplier: { select: { legalName: true, tradeName: true } } },
            orderBy: { endDate: 'asc' },
            take: 5,
          }),
          tx.bankTransaction.count({
            where: { bankAccount: { condominiumId }, status: { in: ['sin_conciliar', 'propuesto'] } },
          }),
        ]);
      return { income, prevIncome, expense, prevExpense, pendingApproval, payable, contracts, unreconciled };
    }),
  ]);

  const income = round2(Number(operational.income._sum.amount ?? 0));
  const prevIncome = round2(Number(operational.prevIncome._sum.amount ?? 0));
  const expense = round2(Number(operational.expense._sum.total ?? 0));
  const prevExpense = round2(Number(operational.prevExpense._sum.total ?? 0));
  const bankBalance = round2(banks.reduce((s, b) => s + b.balance, 0));

  const varPct = (now: number, before: number) => (before > 0 ? round2(((now - before) / before) * 100) : null);

  // --- Alertas: solo lo que requiere una decisión ---
  const alerts: Alert[] = [];

  const porAprobar = operational.pendingApproval;
  if (porAprobar.length > 0) {
    alerts.push({
      level: 'atencion',
      title: `${porAprobar.length} gasto(s) esperan aprobación`,
      detail: `Por ₡${round2(porAprobar.reduce((s, e) => s + Number(e.total), 0)).toLocaleString('es-CR')}. Mientras no se aprueben, no afectan el Estado de Resultados.`,
      href: '/app/finanzas/gastos',
    });
  }

  for (const c of operational.contracts) {
    const days = Math.ceil((c.endDate.getTime() - today.getTime()) / 86_400_000);
    alerts.push({
      level: days < 0 ? 'critico' : 'atencion',
      title: days < 0 ? `Contrato vencido: ${c.title}` : `Contrato por vencer: ${c.title}`,
      detail: `${c.supplier.tradeName ?? c.supplier.legalName} — ${days < 0 ? `venció hace ${Math.abs(days)} días` : `vence en ${days} días`}.`,
      href: '/app/finanzas/recurrentes',
    });
  }

  for (const r of budget.overBudget) {
    alerts.push({
      level: budgetAlert(r.percent) === 'critico' ? 'critico' : 'atencion',
      title: `${r.name} excede el presupuesto`,
      detail: `Va en ${Math.round(r.percent)}% de lo aprobado para el año.`,
      href: '/app/finanzas/presupuesto',
    });
  }

  if (collections.aging.overdueRatio > 0.3) {
    alerts.push({
      level: 'critico',
      title: `Morosidad en ${Math.round(collections.aging.overdueRatio * 100)}%`,
      detail: `₡${collections.aging.overdue.toLocaleString('es-CR')} de cartera vencida en ${collections.debtors.length} filial(es).`,
      href: '/app/finanzas/cobranza',
    });
  }

  if (operational.unreconciled > 0) {
    alerts.push({
      level: 'info',
      title: `${operational.unreconciled} movimiento(s) bancario(s) sin conciliar`,
      detail: 'Revisalos para que el saldo del sistema coincida con el del banco.',
      href: '/app/finanzas/bancos',
    });
  }

  if (cashFlow.runwayMonths !== null && cashFlow.runwayMonths < 1) {
    alerts.push({
      level: 'critico',
      title: 'Liquidez por debajo de un mes de operación',
      detail: `El saldo en bancos cubre ${cashFlow.runwayMonths.toFixed(1)} mes(es) de gasto promedio.`,
      href: '/app/finanzas/flujo',
    });
  }

  // Lo crítico primero: el orden del panel es el orden de atención.
  const order = { critico: 0, atencion: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);

  // --- Indicadores con semáforo ---
  const liquidity = cashFlow.averageExpense > 0 ? bankBalance / cashFlow.averageExpense : null;
  const reserveMonths = reserve?.summary.monthsCovered ?? null;
  const budgetPct =
    budget.totalBudgeted > 0 ? (budget.totalExecuted / budget.totalBudgeted) * 100 : null;

  // Cuánto del ingreso viene de mora en vez de cuota: un condominio que
  // depende de intereses tiene un problema que ningún otro indicador
  // muestra.
  const interestIncome = await withTenantContext(companyId, (tx) =>
    tx.charge.aggregate({
      where: { condominiumId, chargeType: 'interes_moratorio', status: { not: 'anulado' }, createdAt: { gte: prevStart } },
      _sum: { amount: true },
    })
  );
  const totalCharged = await withTenantContext(companyId, (tx) =>
    tx.charge.aggregate({
      where: { condominiumId, status: { not: 'anulado' }, createdAt: { gte: prevStart } },
      _sum: { amount: true },
    })
  );
  const interestRatio =
    Number(totalCharged._sum.amount ?? 0) > 0
      ? Number(interestIncome._sum.amount ?? 0) / Number(totalCharged._sum.amount ?? 0)
      : 0;

  const indicators: Indicator[] = [
    {
      key: 'liquidez',
      label: 'Liquidez',
      value: liquidity !== null ? `${liquidity.toFixed(1)}×` : '—',
      status: liquidity === null ? 'neutral' : liquidity > 2 ? 'ok' : liquidity >= 1 ? 'warn' : 'danger',
      hint: 'Saldo en bancos ÷ gasto mensual promedio',
    },
    {
      key: 'reserva',
      label: 'Meses de reserva',
      value: reserveMonths !== null ? reserveMonths.toFixed(1) : '—',
      status: reserveMonths === null ? 'neutral' : reserveMonths > 3 ? 'ok' : reserveMonths >= 1.5 ? 'warn' : 'danger',
      hint: 'Fondo de reserva ÷ gasto mensual',
    },
    {
      key: 'morosidad',
      label: 'Morosidad',
      value: `${Math.round(collections.aging.overdueRatio * 100)}%`,
      status:
        collections.aging.overdueRatio < 0.15 ? 'ok' : collections.aging.overdueRatio <= 0.3 ? 'warn' : 'danger',
      hint: 'Cartera vencida ÷ cartera total',
    },
    {
      key: 'cobranza',
      label: 'Efectividad de cobranza',
      value: `${Math.round(collections.collectionRate * 100)}%`,
      status: collections.collectionRate > 0.9 ? 'ok' : collections.collectionRate >= 0.75 ? 'warn' : 'danger',
      hint: 'Cobrado del mes ÷ facturado del mes',
    },
    {
      key: 'presupuesto',
      label: 'Ejecución presupuestaria',
      value: budgetPct !== null ? `${Math.round(budgetPct)}%` : '—',
      status:
        budgetPct === null ? 'neutral' : budgetPct <= 105 ? 'ok' : budgetPct <= 115 ? 'warn' : 'danger',
      hint: 'Ejecutado ÷ presupuestado del año',
    },
    {
      key: 'mora',
      label: 'Dependencia de mora',
      value: `${Math.round(interestRatio * 100)}%`,
      status: interestRatio < 0.03 ? 'ok' : interestRatio <= 0.08 ? 'warn' : 'danger',
      hint: 'Ingreso por intereses ÷ ingreso total facturado',
    },
  ];

  const payableWithBalance = operational.payable
    .map((e) => ({
      id: e.id,
      number: e.expenseNumber,
      description: e.description,
      dueDate: e.dueDate,
      pending: round2(Number(e.total) - e.payments.reduce((s, p) => s + Number(p.amount), 0)),
    }))
    .filter((e) => e.pending > 0);

  return {
    alerts,
    indicators,
    kpis: {
      income,
      incomeVar: varPct(income, prevIncome),
      expense,
      expenseVar: varPct(expense, prevExpense),
      result: round2(income - expense),
      bankBalance,
      bankCount: banks.length,
    },
    cashFlow,
    aging: collections.aging,
    debtorCount: collections.debtors.length,
    budget: budget.rows.filter((r) => r.budgeted > 0).sort((a, b) => b.percent - a.percent).slice(0, 6),
    pendingApproval: operational.pendingApproval.map((e) => ({
      id: e.id,
      number: e.expenseNumber,
      description: e.description,
      total: round2(Number(e.total)),
      status: e.status,
    })),
    payable: payableWithBalance,
    unreconciled: operational.unreconciled,
    reserve: reserve?.summary ?? null,
  };
}
