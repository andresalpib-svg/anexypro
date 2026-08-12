import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance } from '@/lib/services/finance';
import { listExpenses, listBudgetLineOptions, CATEGORY_LABEL, STATUS_LABEL } from '@/lib/services/expenses';
import { listRecurring, listContracts } from '@/lib/services/recurring';
import { listBankAccountsWithBalance } from '@/lib/services/bank-accounts';
import { getCashFlow } from '@/lib/services/cash-flow';
import { getBudget } from '@/lib/services/budget';
import { getCollectionsView, listPaymentPlans, listRecentActions } from '@/lib/services/collections';
import { listPeriods, getCloseChecks } from '@/lib/services/accounting-periods';
import { getLibroDiario, getBalanceGeneral, getEstadoResultados } from '@/lib/services/accounting';
import { getFinancialDashboard } from '@/lib/services/financial-dashboard';
import { BUCKET_LABEL, BUCKET_ORDER } from '@/lib/domain/aging';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  recordatorio: 'Recordatorio',
  aviso_vencido: 'Aviso de vencido',
  aviso_formal: 'Aviso formal',
  aviso_suspension: 'Aviso de suspensión',
  expediente_legal: 'Expediente legal',
  llamada: 'Llamada',
  nota: 'Nota',
};

const fechaISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

type Sheet = { name: string; rows: Record<string, unknown>[] };

/**
 * Descarga en Excel del reporte de CADA pestaña de Finanzas y
 * Contabilidad. Una sola ruta, mismos servicios que las pantallas —
 * el reporte y la pantalla nunca se contradicen.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!can(session, 'finanzas')) return new Response('Sin acceso a Finanzas', { status: 403 });

  const condoId = req.nextUrl.searchParams.get('condoId') ?? '';
  const tab = req.nextUrl.searchParams.get('tab') ?? '';

  // El condominio se valida contra los que la sesión puede ver.
  const condos = await listCondominiumsForSession(session!);
  const condo = condos.find((c) => c.id === condoId);
  if (!condo) return new Response('Sin acceso a ese condominio', { status: 403 });

  const companyId = session!.user.companyId;
  const currency = condo.currency;
  let sheets: Sheet[];

  if (tab === 'panel') {
    const d = await getFinancialDashboard(companyId, condoId);
    sheets = [
      {
        name: 'Resumen',
        rows: [
          { Concepto: 'Ingresos del mes', Valor: d.kpis.income, Moneda: currency },
          { Concepto: 'Gastos del mes', Valor: d.kpis.expense, Moneda: currency },
          { Concepto: 'Resultado del mes', Valor: d.kpis.result, Moneda: currency },
          { Concepto: 'Saldo en bancos', Valor: d.kpis.bankBalance, Moneda: currency },
          { Concepto: 'Cartera total', Valor: d.aging.total, Moneda: currency },
          { Concepto: 'Cartera vencida', Valor: d.aging.overdue, Moneda: currency },
          { Concepto: 'Filiales en mora', Valor: d.debtorCount, Moneda: '' },
        ],
      },
      {
        name: 'Indicadores',
        rows: d.indicators.map((i) => ({ Indicador: i.label, Valor: i.value, Estado: i.status, Nota: i.hint })),
      },
      {
        name: 'Alertas',
        rows: d.alerts.map((a) => ({ Nivel: a.level, Alerta: a.title, Detalle: a.detail })),
      },
    ];
  } else if (tab === 'cuotas') {
    const properties = await listPropertiesWithBalance(companyId, condoId);
    sheets = [
      {
        name: 'Cuotas y pagos',
        rows: properties.map((p) => ({
          Unidad: p.code,
          Propietario: p.ownerName ?? '',
          Moneda: currency,
          Saldo: p.balance,
          'Cuotas ordinarias vencidas': p.monthsOverdue,
          Estado: p.suspended
            ? p.manualSuspension
              ? 'Suspendida (manual)'
              : 'Suspendida'
            : p.hasPaymentPlan && p.balance > 0
              ? 'Convenio vigente'
              : p.balance > 0
                ? 'Saldo pendiente'
                : 'Al día',
        })),
      },
    ];
  } else if (tab === 'gastos') {
    const [expenses, accounts] = await Promise.all([
      listExpenses(companyId, condoId),
      listBudgetLineOptions(companyId, condoId),
    ]);
    const accountName = new Map(accounts.map((a) => [a.code, a.name]));
    sheets = [
      {
        name: 'Gastos',
        rows: expenses.map((e) => ({
          'N.º': e.expenseNumber,
          Fecha: fechaISO(e.issueDate),
          Proveedor: e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : '',
          Descripción: e.description,
          'N.º factura': e.invoiceNumber ?? '',
          Categoría: CATEGORY_LABEL[e.category] ?? e.category,
          'Línea presupuestaria': `${e.accountCode}${accountName.has(e.accountCode) ? ` — ${accountName.get(e.accountCode)}` : ''}`,
          Moneda: currency,
          Subtotal: Number(e.subtotal),
          Impuesto: Number(e.taxAmount),
          Total: Number(e.total),
          Pagado: e.payments.reduce((s, p) => s + Number(p.amount), 0),
          Estado: STATUS_LABEL[e.status] ?? e.status,
        })),
      },
    ];
  } else if (tab === 'recurrentes') {
    const [recurring, contracts] = await Promise.all([
      listRecurring(companyId, condoId),
      listContracts(companyId, condoId),
    ]);
    sheets = [
      {
        name: 'Gastos recurrentes',
        rows: recurring.map((r) => ({
          Descripción: r.description,
          Proveedor: r.supplier ? (r.supplier.tradeName ?? r.supplier.legalName) : '',
          Categoría: CATEGORY_LABEL[r.category] ?? r.category,
          Moneda: currency,
          Monto: Number(r.amount),
          Frecuencia: r.frequency,
          'Día del mes': r.dayOfMonth,
          Desde: fechaISO(r.startDate),
          Hasta: fechaISO(r.endDate),
          Activo: r.isActive ? 'Sí' : 'No',
          'Última generación': fechaISO(r.lastGenerated),
        })),
      },
      {
        name: 'Contratos',
        rows: contracts.map((c) => ({
          Contrato: c.title,
          Proveedor: c.supplier.tradeName ?? c.supplier.legalName,
          Servicio: c.serviceType,
          Moneda: currency,
          'Monto mensual': c.monthlyAmount === null ? '' : Number(c.monthlyAmount),
          Inicio: fechaISO(c.startDate),
          Vence: fechaISO(c.endDate),
          'Renovación automática': c.autoRenew ? 'Sí' : 'No',
          Estado: c.status,
        })),
      },
    ];
  } else if (tab === 'bancos') {
    const banks = await listBankAccountsWithBalance(companyId, condoId);
    sheets = [
      {
        name: 'Bancos',
        rows: banks.map((b) => ({
          Banco: b.bankName,
          Cuenta: b.name,
          'N.º de cuenta': b.accountNumber,
          IBAN: b.iban ?? '',
          Moneda: b.currency,
          'Cuenta contable': b.accountCode,
          'Saldo inicial': Number(b.openingBalance),
          'Saldo según libros': b.balance,
        })),
      },
    ];
  } else if (tab === 'flujo') {
    const flow = await getCashFlow(companyId, condoId, { history: 12, forecast: 6 });
    sheets = [
      {
        name: 'Flujo de caja',
        rows: flow.months.map((m) => ({
          Período: m.period,
          Mes: m.label,
          Moneda: currency,
          Ingresos: m.income,
          Gastos: m.expense,
          Neto: m.net,
          'Saldo acumulado': m.balance,
          Tipo: m.projected ? 'Proyectado' : 'Real',
        })),
      },
      {
        name: 'Parámetros',
        rows: [
          { Concepto: 'Saldo actual', Valor: flow.currentBalance },
          { Concepto: 'Tasa de recuperación histórica', Valor: `${Math.round(flow.collectionRate * 100)}%` },
          { Concepto: 'Gasto mensual promedio', Valor: flow.averageExpense },
          { Concepto: 'Meses de operación cubiertos', Valor: flow.runwayMonths ?? '' },
        ],
      },
    ];
  } else if (tab === 'presupuesto') {
    const year = new Date().getUTCFullYear();
    const budget = await getBudget(companyId, condoId, year);
    sheets = [
      {
        name: `Presupuesto ${year}`,
        rows: budget.rows
          .filter((r) => r.budgeted > 0 || r.executed > 0)
          .map((r) => ({
            Cuenta: r.code,
            Partida: r.name,
            Moneda: currency,
            Presupuestado: r.budgeted,
            Ejecutado: r.executed,
            Disponible: r.available,
            '% ejecutado': r.percent,
            'Año anterior': r.lastYear,
          })),
      },
    ];
  } else if (tab === 'cobranza') {
    const [view, plans, actions] = await Promise.all([
      getCollectionsView(companyId, condoId),
      listPaymentPlans(companyId, condoId),
      listRecentActions(companyId, condoId),
    ]);
    sheets = [
      {
        name: 'Filiales en mora',
        rows: view.debtors.map((d) => ({
          Filial: d.code,
          Propietario: d.ownerName ?? '',
          Moneda: currency,
          Debe: d.total,
          'Días de atraso': d.oldestDays,
          ...Object.fromEntries(BUCKET_ORDER.map((b) => [BUCKET_LABEL[b], d.buckets[b] ?? 0])),
          'Convenio vigente': d.hasPlan ? 'Sí' : 'No',
          'Última gestión': d.lastAction
            ? `${ACTION_LABEL[d.lastAction.type] ?? d.lastAction.type} (${fechaISO(d.lastAction.at)})`
            : '',
        })),
      },
      {
        name: 'Convenios',
        rows: plans.map((p) => ({
          Filial: p.property.code,
          Moneda: currency,
          'Deuda total': Number(p.totalDebt),
          Prima: Number(p.downPayment),
          Cuotas: p.installments,
          Desde: fechaISO(p.startDate),
          Estado: p.status,
        })),
      },
      {
        name: 'Gestiones',
        rows: actions.map((a) => ({
          Fecha: fechaISO(a.createdAt),
          Filial: a.property.code,
          Gestión: ACTION_LABEL[a.actionType] ?? a.actionType,
          Canal: a.channel ?? '',
          Notas: a.notes ?? '',
          'Deuda al momento': a.debtAmount === null ? '' : Number(a.debtAmount),
          'Días de atraso': a.daysOverdue ?? '',
          Origen: a.automated ? 'Automática' : 'Manual',
        })),
      },
    ];
  } else if (tab === 'cierre') {
    const now = new Date();
    const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const [periods, checks] = await Promise.all([
      listPeriods(companyId, condoId),
      getCloseChecks(companyId, condoId, currentPeriod),
    ]);
    sheets = [
      {
        name: 'Períodos',
        rows: periods.map((p) => ({
          Período: p.period,
          Estado: p.status,
          'Cerrado por': p.closedBy?.fullName ?? '',
          'Fecha de cierre': fechaISO(p.closedAt),
          'Motivo de reapertura': p.reopenReason ?? '',
        })),
      },
      {
        name: `Verificaciones ${currentPeriod}`,
        rows: checks.map((c) => ({ Verificación: c.label, Estado: c.ok ? 'Correcto' : 'Pendiente', Detalle: c.detail })),
      },
    ];
  } else if (tab === 'contabilidad') {
    const [diario, balance, resultados] = await Promise.all([
      getLibroDiario(companyId, condoId, 2000),
      getBalanceGeneral(companyId, condoId),
      getEstadoResultados(companyId, condoId),
    ]);
    sheets = [
      {
        name: 'Balance General',
        rows: balance.map((b) => ({ Cuenta: b.code, Nombre: b.name, Tipo: b.type, Moneda: currency, Saldo: Number(b.balance) })),
      },
      {
        name: 'Estado de Resultados',
        rows: resultados.map((r) => ({ Cuenta: r.code, Nombre: r.name, Tipo: r.type, Moneda: currency, Saldo: Number(r.balance) })),
      },
      {
        name: 'Libro Diario',
        rows: diario.map((l) => ({
          Fecha: fechaISO(l.entry_date),
          Cuenta: l.code,
          Nombre: l.name,
          Descripción: l.description,
          Moneda: currency,
          Débito: Number(l.debit),
          Crédito: Number(l.credit),
        })),
      },
    ];
  } else {
    return new Response('Reporte desconocido', { status: 400 });
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const rows = sheet.rows.length > 0 ? sheet.rows : [{ Aviso: 'Sin datos todavía.' }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const firstRow = rows[0]!;
    ws['!cols'] = Object.keys(firstRow).map((key) => ({
      wch: Math.min(60, Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2),
    }));
    // Los nombres de hoja en Excel llevan máximo 31 caracteres.
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const today = new Date().toISOString().slice(0, 10);
  const slug = condo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${tab}-${slug}-${today}.xlsx"`,
    },
  });
}
