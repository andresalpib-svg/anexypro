import { withTenantContext, forEachCompany } from '@/lib/db';
import { getFinancialDashboard } from '@/lib/services/financial-dashboard';

/**
 * Informe financiero mensual.
 *
 * Para una administradora con 40 condominios, esto son 40 informes
 * que hoy se escriben a mano todos los meses. El texto sale de las
 * mismas cifras del panel, así que el informe y el sistema nunca se
 * contradicen.
 */

export type MonthlyReport = {
  condominiumId: string;
  condominiumName: string;
  period: string;
  title: string;
  /** Texto listo para reenviar a la junta directiva. */
  body: string;
  generatedAt: Date;
};

const fmt = (n: number, currency = 'CRC') =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n)}%`;

const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export async function buildMonthlyReport(
  companyId: string,
  condominiumId: string,
  reference = new Date()
): Promise<MonthlyReport> {
  const condo = await withTenantContext(companyId, (tx) =>
    tx.condominium.findUniqueOrThrow({
      where: { id: condominiumId },
      select: { name: true, currency: true },
    })
  );
  const data = await getFinancialDashboard(companyId, condominiumId);

  // El informe habla del mes ANTERIOR: el que ya cerró.
  const prev = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
  const period = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const nombreMes = `${MES[prev.getUTCMonth()]} de ${prev.getUTCFullYear()}`;
  const money = (n: number) => fmt(n, condo.currency);

  const partes: string[] = [];

  partes.push(`INFORME FINANCIERO — ${condo.name.toUpperCase()}`);
  partes.push(`Período: ${nombreMes}`);
  partes.push('');

  // --- Resultado ---
  partes.push('RESULTADO DEL MES');
  partes.push(`Ingresos: ${money(data.kpis.income)}${data.kpis.incomeVar !== null ? ` (${data.kpis.incomeVar >= 0 ? '+' : ''}${data.kpis.incomeVar.toFixed(1)}% vs. mes anterior)` : ''}`);
  partes.push(`Gastos: ${money(data.kpis.expense)}${data.kpis.expenseVar !== null ? ` (${data.kpis.expenseVar >= 0 ? '+' : ''}${data.kpis.expenseVar.toFixed(1)}% vs. mes anterior)` : ''}`);
  partes.push(`Resultado: ${money(data.kpis.result)}`);
  partes.push(`Saldo en bancos: ${money(data.kpis.bankBalance)} en ${data.kpis.bankCount} cuenta(s).`);
  partes.push('');

  // --- Cobranza ---
  partes.push('COBRANZA');
  partes.push(`Cartera total: ${money(data.aging.total)}, de la cual ${money(data.aging.overdue)} está vencida (${pct(data.aging.overdueRatio * 100)}).`);
  partes.push(`Filiales en mora: ${data.debtorCount}.`);
  const morosidad = data.indicators.find((i) => i.key === 'morosidad');
  const cobranza = data.indicators.find((i) => i.key === 'cobranza');
  if (cobranza) partes.push(`Efectividad de cobranza del mes: ${cobranza.value}.`);
  if (morosidad?.status === 'danger') {
    partes.push('La morosidad supera el 30 % de la cartera: requiere atención de la junta directiva.');
  }
  partes.push('');

  // --- Presupuesto ---
  if (data.budget.length > 0) {
    partes.push('EJECUCIÓN PRESUPUESTARIA');
    for (const r of data.budget.slice(0, 6)) {
      partes.push(`- ${r.name}: ${money(r.executed)} de ${money(r.budgeted)} (${pct(r.percent)}).`);
    }
    const excedidas = data.budget.filter((r) => r.percent >= 100);
    if (excedidas.length > 0) {
      partes.push(`${excedidas.length} partida(s) superaron lo aprobado para el año.`);
    }
    partes.push('');
  }

  // --- Fondo de reserva ---
  if (data.reserve) {
    partes.push('FONDO DE RESERVA');
    partes.push(`Saldo: ${money(data.reserve.balance)}.`);
    if (data.reserve.targetAmount) {
      partes.push(`Meta: ${money(data.reserve.targetAmount)} (${pct((data.reserve.progress ?? 0) * 100)} alcanzado).`);
    }
    if (data.reserve.monthsCovered !== null) {
      partes.push(`Cubre ${data.reserve.monthsCovered.toFixed(1)} mes(es) de operación.`);
    }
    partes.push('');
  }

  // --- Lo que requiere decisión ---
  if (data.alerts.length > 0) {
    partes.push('ASUNTOS QUE REQUIEREN ATENCIÓN');
    for (const a of data.alerts.slice(0, 6)) {
      partes.push(`- ${a.title}. ${a.detail}`);
    }
    partes.push('');
  } else {
    partes.push('No hay asuntos pendientes que requieran decisión de la junta.');
    partes.push('');
  }

  // --- Proyección ---
  const proyectados = data.cashFlow.months.filter((m) => m.projected);
  if (proyectados.length > 0) {
    const ultimo = proyectados[proyectados.length - 1]!;
    partes.push('PROYECCIÓN');
    partes.push(
      `Con la tasa de recuperación histórica de ${pct(data.cashFlow.collectionRate * 100)} y el gasto promedio actual, el saldo proyectado a ${ultimo.label} es ${money(ultimo.balance)}.`
    );
    if (data.cashFlow.runwayMonths !== null && data.cashFlow.runwayMonths < 2) {
      partes.push(
        `Atención: el saldo actual cubre ${data.cashFlow.runwayMonths.toFixed(1)} mes(es) de operación.`
      );
    }
    partes.push('');
  }

  partes.push('---');
  partes.push('Informe generado automáticamente por ANEXYpro a partir de los movimientos registrados.');

  return {
    condominiumId,
    condominiumName: condo.name,
    period,
    title: `Informe financiero — ${condo.name} — ${nombreMes}`,
    body: partes.join('\n'),
    generatedAt: new Date(),
  };
}

export type MonthlyRunSummary = { condominiums: number; generated: number; errors: string[] };

/**
 * Genera el informe de todos los condominios y lo deja como comunicado
 * en BORRADOR dirigido a la junta directiva. Nunca lo envía solo: el
 * administrador lo revisa y decide.
 */
export async function generateMonthlyReports(
  reference: Date,
  opts?: { companyId?: string }
): Promise<MonthlyRunSummary> {
  // Corre desde el programador, sin sesión: empresa por empresa.
  const condos = (
    await forEachCompany(
      (tx) =>
        tx.condominium.findMany({
          where: { deletedAt: null },
          select: { id: true, companyId: true, name: true },
        }),
      { includeDemo: false, companyId: opts?.companyId }
    )
  ).flatMap((x) => x.result);

  const summary: MonthlyRunSummary = { condominiums: condos.length, generated: 0, errors: [] };

  for (const condo of condos) {
    try {
      const report = await buildMonthlyReport(condo.companyId, condo.id, reference);

      // Idempotencia: un informe por condominio y período.
      const existing = await withTenantContext(condo.companyId, (tx) =>
        tx.communication.findFirst({
          where: { condominiumId: condo.id, title: report.title },
          select: { id: true },
        })
      );
      if (existing) continue;

      // Queda en BORRADOR dirigido a la junta directiva: el informe
      // se genera solo, pero enviarlo es decisión del administrador.
      await withTenantContext(condo.companyId, (tx) =>
        tx.communication.create({
          data: {
            condominiumId: condo.id,
            title: report.title,
            body: report.body,
            category: 'noticia',
            source: 'automatico',
            status: 'borrador',
            targets: { create: [{ targetType: 'rol', role: 'junta_directiva' }] },
          },
        })
      );
      summary.generated += 1;
    } catch (e: any) {
      summary.errors.push(`${condo.name}: ${e?.message ?? 'error'}`);
    }
  }

  return summary;
}
