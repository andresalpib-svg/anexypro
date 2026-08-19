import { Lock, FileSpreadsheet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  getFinancialReport,
  getDelinquencyReport,
  getMaintenanceReport,
  getProjectsReport,
  getEgresosReport,
  getResumenFinanciero,
} from '@/lib/services/reports';
import { getEstadoResultadosRango, getBalanceGeneral } from '@/lib/services/accounting';
import { getBudget } from '@/lib/services/budget';
import { listFunds } from '@/lib/services/funds';
import { listInvestments, listInvestmentInterests, INVESTMENT_TYPE_LABEL, INVESTMENT_STATUS_LABEL } from '@/lib/services/investments';
import { listAssets } from '@/lib/services/maintenance';
import { listAssetBookValues, listDepreciationEntries } from '@/lib/services/asset-depreciation';
import { PageHeader } from '@/components/ui/page-header';
import { ReportTabsNav } from './tabs';
import { ExplainWithAI } from './explain-with-ai';
import { ViolationsTab } from './violations-tab';
import { YearSelect } from './year-select';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { resolveCondoId } from '@/lib/active-condo';
import { CondoSelect } from '../propiedades/condo-select';
import { round2 } from '@/lib/domain/late-interest';
import { saldoParaMostrar } from '@/lib/domain/balance-presentacion';

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

const FUND_TYPE_LABEL: Record<string, string> = {
  operativo: 'Fondo operativo',
  reserva: 'Fondo de reserva',
  especial: 'Fondo especial',
  proyecto: 'Fondo para proyecto',
  otro: 'Otro fondo',
};

/** Mismo mapa que usa el Excel — la pantalla enseñaba el valor crudo del enum. */
const PROJECT_STATUS_LABEL: Record<string, string> = {
  planificado: 'Planificado',
  en_progreso: 'En progreso',
  pausado: 'Pausado',
  completado: 'Completado',
  cancelado: 'Cancelado',
};

const ASSET_STATUS_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  baja: 'De baja',
};

type SearchParams = {
  tab?: string;
  condoId?: string;
  anio?: string;
  estado?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  conMulta?: string;
  reincidencias?: string;
};

/**
 * Encabezado de las pestañas de un solo condominio (Etapa 7) — mismo
 * mecanismo que ya usaba `IncumplimientosTab` (`resolveCondoId`), pero
 * con un `<CondoSelect>` visible: hoy Incumplimientos no lo tenía y
 * dependía del Condominio Activo global. Devuelve `null` si no hay
 * condominios — la pantalla ya avisa "Sin condominios disponibles".
 */
async function resolveSingleCondo(
  session: { user: { id: string; companyId: string; role: string } },
  searchParams: SearchParams
) {
  const condos = await listCondominiumsForSession(session);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  return { condos, condoId };
}

// Pestañas de un solo condominio (Etapa 7) — el Excel de descarga
// necesita condoId (y año, cuando aplica) igual que ya hacía Incumplimientos.
const SINGLE_CONDO_TABS = new Set([
  'incumplimientos',
  'resumen',
  'ingresos',
  'egresos',
  'fondos',
  'inversiones',
  'intereses',
  'activos',
  'depreciaciones',
  'presupuesto',
]);
const YEAR_TABS = new Set(['resumen', 'ingresos', 'egresos', 'presupuesto']);

export default async function ReportesPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!can(session, 'reportes')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Reportes</p>
      </div>
    );
  }

  const tab = searchParams.tab ?? 'financiero';
  const companyId = session!.user.companyId;

  // Recorta el consolidado a los condominios que la sesión puede ver:
  // TODOS para admin_owner/contador, solo los asignados para
  // admin_staff — mismo criterio que el resto del panel (auditoría de
  // seguridad 2026-08-11, hallazgo #16). Solo lo usan las pestañas
  // consolidadas multi-condominio; las de un solo condominio (abajo)
  // resuelven el suyo con `resolveSingleCondo`.
  const condoIds = (await listCondominiumsForSession(session!)).map((c) => c.id);

  let exportUrl = `/app/reportes/exportar?tab=${tab}`;
  if (SINGLE_CONDO_TABS.has(tab)) exportUrl += `&condoId=${searchParams.condoId ?? ''}`;
  if (YEAR_TABS.has(tab)) exportUrl += `&anio=${searchParams.anio ?? ''}`;

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Consolidado de tus condominios — nunca mezcla monedas distintas en un mismo total"
        action={
          <a href={exportUrl} className="btn-ghost">
            <FileSpreadsheet size={16} /> Descargar Excel
          </a>
        }
      />
      <ReportTabsNav tab={tab} />
      <ExplainWithAI tab={tab} />

      {tab === 'financiero' && <FinancieroTab companyId={companyId} condoIds={condoIds} />}
      {tab === 'resumen' && <ResumenTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'ingresos' && <IngresosTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'egresos' && <EgresosTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'morosidad' && <MorosidadTab companyId={companyId} condoIds={condoIds} />}
      {tab === 'fondos' && <FondosTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'inversiones' && <InversionesTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'intereses' && <InteresesTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'activos' && <ActivosReportTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'depreciaciones' && <DepreciacionesTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'presupuesto' && <PresupuestoReportTab companyId={companyId} searchParams={searchParams} />}
      {tab === 'mantenimiento' && <MantenimientoTab companyId={companyId} condoIds={condoIds} />}
      {tab === 'proyectos' && <ProyectosTab companyId={companyId} condoIds={condoIds} />}
      {tab === 'incumplimientos' && <IncumplimientosTab companyId={companyId} searchParams={searchParams} />}
    </div>
  );
}

async function FinancieroTab({ companyId, condoIds }: { companyId: string; condoIds: string[] }) {
  const rows = await getFinancialReport(companyId, condoIds);
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Condominio</th>
            <th className="px-4 py-3 text-right">Facturado</th>
            <th className="px-4 py-3 text-right">Recaudado</th>
            <th className="px-4 py-3 text-right">% Recaudo</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-muted">Sin condominios activos todavía.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.condoId} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{r.condoName}</td>
                <td className="px-4 py-3 text-right">{fmt(r.billed, r.currency)}</td>
                <td className="px-4 py-3 text-right">{fmt(r.collected, r.currency)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${r.pct >= 90 ? 'text-ok' : r.pct >= 70 ? 'text-warn' : 'text-danger'}`}>{r.pct}%</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

async function MorosidadTab({ companyId, condoIds }: { companyId: string; condoIds: string[] }) {
  const rows = await getDelinquencyReport(companyId, condoIds);
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Unidad</th>
            <th className="px-4 py-3">Condominio</th>
            <th className="px-4 py-3 text-right">Saldo</th>
            <th className="px-4 py-3 text-right">Días de atraso</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-muted">Sin unidades en morosidad — buen estado de cobranza.</td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">{r.propertyCode}</td>
                <td className="px-4 py-3 text-muted">{r.condoName}</td>
                <td className="px-4 py-3 text-right text-danger">{fmt(r.balance, r.currency)}</td>
                <td className="px-4 py-3 text-right text-muted">{r.daysOverdue}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

async function MantenimientoTab({ companyId, condoIds }: { companyId: string; condoIds: string[] }) {
  const r = await getMaintenanceReport(companyId, condoIds);
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi label="Tickets totales" value={r.total} />
      <Kpi label="Preventivos" value={r.preventivos} />
      <Kpi label="Completados" value={r.byStatus.completado ?? 0} />
      <Kpi label="Costo acumulado" value={new Intl.NumberFormat('es-CR').format(r.totalCost)} />
    </div>
  );
}

async function ProyectosTab({ companyId, condoIds }: { companyId: string; condoIds: string[] }) {
  const rows = await getProjectsReport(companyId, condoIds);
  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Proyecto</th>
            <th className="px-4 py-3">Condominio</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3 text-right">Presupuesto</th>
            <th className="px-4 py-3 text-right">Gastado</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted">Sin proyectos todavía.</td>
            </tr>
          ) : (
            rows.map((p, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3 text-muted">{p.condoName}</td>
                <td className="px-4 py-3 text-muted">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</td>
                <td className="px-4 py-3 text-right">{fmt(p.budget, p.currency)}</td>
                <td className={`px-4 py-3 text-right ${p.spent > p.budget ? 'text-danger' : 'text-ink'}`}>{fmt(p.spent, p.currency)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-5">
      <p className="font-sans text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-sm font-medium text-muted">{label}</p>
    </div>
  );
}


function SinCondominios() {
  return <div className="card mt-5 p-10 text-center text-sm text-muted">No hay condominios disponibles.</div>;
}

/** Últimos 4 años — no hay un "listYearsWithData" para el libro diario; a diferencia de Presupuesto, que sí tiene `listBudgetYears`. */
function recentYears(anio: number): number[] {
  return [anio, anio - 1, anio - 2, anio - 3];
}

/**
 * El reporte de incumplimientos va por condominio —el módulo es por
 * condominio—, así que resuelve el Condominio Activo igual que las
 * demás pantallas del panel. Ahora con `<CondoSelect>` visible (Etapa
 * 7) — antes dependía en silencio del Condominio Activo global.
 */
async function IncumplimientosTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <ViolationsTab companyId={companyId} condominiumId={condoId} filtros={searchParams} />
    </div>
  );
}

/**
 * Resumen financiero — ingresos, egresos y resultado del año.
 *
 * Los dos lados salen del MISMO libro diario: los ingresos de
 * `v_libro_mayor` vía `getEstadoResultadosRango`, y los egresos de
 * `getEgresosReport`, que lee esos mismos asientos agrupados por
 * origen. Así el "Resultado" de acá ES el resultado contable.
 *
 * Antes los egresos salían solo del módulo de Gastos y por eso este
 * resumen ignoraba la depreciación y el costo de los tickets de
 * mantenimiento — gasto real del condominio, contabilizado, y que las
 * pestañas "Depreciaciones" y "Mantenimiento" de esta misma pantalla
 * sí mostraban (auditoría de la Etapa 7, hallazgo 7.2). El desglose
 * por origen queda a la vista para que se pueda reconciliar contra
 * `Finanzas → Gastos` sin tener que creerle al total.
 */
async function ResumenTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const year = Number(searchParams.anio) || new Date().getUTCFullYear();

  const [resumen, balance] = await Promise.all([
    getResumenFinanciero(companyId, condoId, year),
    getBalanceGeneral(companyId, condoId),
  ]);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <YearSelect tab="resumen" condoId={condoId} year={year} years={recentYears(year)} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Kpi label={`Ingresos ${year}`} value={fmt(resumen.totalIngresos, currency)} />
        <Kpi label={`Egresos ${year}`} value={fmt(resumen.totalEgresos, currency)} />
        <Kpi label="Resultado" value={fmt(resumen.resultado, currency)} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Ingresos y egresos salen del mismo libro diario del año — el resultado de acá es el resultado contable.
      </p>

      {resumen.egresosPorOrigen.length > 0 && (
        <div className="card mt-4 overflow-x-auto">
          <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            De dónde vienen los egresos
          </p>
          <table className="w-full text-sm">
            <tbody>
              {resumen.egresosPorOrigen.map((o) => (
                <tr key={o.sourceTable} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">{o.label}</td>
                  <td className="px-4 py-2.5 text-right font-sans font-semibold text-ink">{fmt(o.total, currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-4 py-3">Total de egresos {year}</td>
                <td className="px-4 py-3 text-right">{fmt(resumen.totalEgresos, currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="card mt-4 overflow-x-auto">
        <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          Balance de situación (histórico acumulado)
        </p>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {balance.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">Sin movimientos contables todavía.</td>
              </tr>
            ) : (
              balance.map((r) => (
                <tr key={r.code} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{r.code} · {r.name}</td>
                  <td className="px-4 py-3 capitalize text-muted">{r.type}</td>
                  {/* Pasivo y patrimonio llevan saldo acreedor: se presentan en
                      positivo, igual que en el PDF de estados financieros. */}
                  <td className="px-4 py-3 text-right font-sans font-semibold text-ink">
                    {fmt(saldoParaMostrar(r.type, Number(r.balance)), currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Ingresos — misma vista `v_estado_resultados` que Resumen, filtrada a cuentas de ingreso. */
async function IngresosTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const year = Number(searchParams.anio) || new Date().getUTCFullYear();

  const resultados = await getEstadoResultadosRango(
    companyId,
    condoId,
    new Date(Date.UTC(year, 0, 1)),
    new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  );
  const rows = resultados.filter((r) => r.type === 'ingreso');
  const total = round2(rows.reduce((s, r) => s + Number(r.balance), 0));

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <YearSelect tab="ingresos" condoId={condoId} year={year} years={recentYears(year)} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3 text-right">Monto {year}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-10 text-center text-muted">Sin ingresos registrados en {year}.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.code} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{r.code} · {r.name}</td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-ok">{fmt(Number(r.balance), currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{fmt(total, currency)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/**
 * Egresos — el gasto contabilizado del año, completo.
 *
 * La tabla de detalle son las facturas del módulo de Gastos (las
 * mismas filas y el mismo subtotal que `Finanzas → Gastos`); debajo va
 * el resto del gasto que el condominio sí tuvo pero que nunca pasó por
 * ese módulo —depreciación de activos, tickets de mantenimiento
 * completados, gastos de proyecto— y el total general, que es el que
 * usa "Resumen financiero" y el que ejecuta el presupuesto. Un solo
 * número de egresos en todo el sistema (`expense-ledger.ts`).
 */
async function EgresosTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const year = Number(searchParams.anio) || new Date().getUTCFullYear();

  const reporte = await getEgresosReport(companyId, condoId, year);
  const otros = reporte.ledger.byOrigin.filter((o) => o.sourceTable !== 'expenses');

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <YearSelect tab="egresos" condoId={condoId} year={year} years={recentYears(year)} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Kpi label="Módulo de Gastos" value={fmt(reporte.totalLines, currency)} />
        <Kpi label="Otros egresos contabilizados" value={fmt(round2(reporte.ledger.total - reporte.totalLines), currency)} />
        <Kpi label={`Total de egresos ${year}`} value={fmt(reporte.ledger.total, currency)} />
      </div>

      {reporte.descuadre !== 0 && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-ink">
          El detalle del módulo de Gastos ({fmt(reporte.totalLines, currency)}) no coincide con lo que el libro diario
          le atribuye ({fmt(reporte.ledger.totalModulo, currency)}); diferencia de {fmt(reporte.descuadre, currency)}.
          Revisá en Finanzas → Gastos si algún gasto quedó sin asiento contable.
        </p>
      )}

      <div className="card mt-4 overflow-x-auto">
        <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          Detalle del módulo de Gastos
        </p>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">N.º</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {reporte.lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">Sin gastos registrados en {year}.</td>
              </tr>
            ) : (
              reporte.lines.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">#{e.expenseNumber}</td>
                  <td className="px-4 py-3 text-muted">{e.issueDate.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-ink">{e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : '—'}</td>
                  <td className="px-4 py-3 text-muted">{e.description}</td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-danger">{fmt(Number(e.total), currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          {reporte.lines.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-4 py-3" colSpan={4}>Subtotal — igual a Finanzas → Gastos</td>
                <td className="px-4 py-3 text-right">{fmt(reporte.totalLines, currency)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          Otros egresos contabilizados — no pasan por el módulo de Gastos
        </p>
        <table className="w-full text-sm">
          <tbody>
            {otros.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted">
                  Todo el gasto de {year} entró por el módulo de Gastos.
                </td>
              </tr>
            ) : (
              otros.map((o) => (
                <tr key={o.sourceTable} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">{o.label}</td>
                  <td className="px-4 py-2.5 text-right font-sans font-semibold text-ink">{fmt(o.total, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-bold text-ink">
              <td className="px-4 py-3">Total de egresos {year}</td>
              <td className="px-4 py-3 text-right">{fmt(reporte.ledger.total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Fondos — misma `listFunds` que `Finanzas → Fondos`. */
async function FondosTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const funds = await listFunds(companyId, condoId);

  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Fondo</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Operativo</th>
              <th className="px-4 py-3 text-right">Comprometido</th>
              <th className="px-4 py-3 text-right">Invertido</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {funds.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">Este condominio no tiene fondos todavía.</td>
              </tr>
            ) : (
              funds.map((f) => (
                <tr key={f.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{f.name}</td>
                  <td className="px-4 py-3 text-muted">{FUND_TYPE_LABEL[f.type] ?? f.type}</td>
                  <td className="px-4 py-3 text-right text-ok">{fmt(f.balance.operativo, currency)}</td>
                  <td className="px-4 py-3 text-right text-warn">{fmt(f.balance.comprometido, currency)}</td>
                  <td className="px-4 py-3 text-right text-royal">{fmt(f.balance.invertido, currency)}</td>
                  <td className="px-4 py-3 text-right font-sans font-bold text-ink">{fmt(f.balance.total, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Inversiones — misma `listInvestments` que `Finanzas → Inversiones`. */
async function InversionesTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const investments = await listInvestments(companyId, condoId);

  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Institución</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Fondo</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-right">Tasa</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {investments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">Sin inversiones registradas todavía.</td>
              </tr>
            ) : (
              investments.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{i.institution}</td>
                  <td className="px-4 py-3 text-muted">{INVESTMENT_TYPE_LABEL[i.investmentType] ?? i.investmentType}</td>
                  <td className="px-4 py-3 text-muted">{i.fund.name}</td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-ink">{fmt(Number(i.amount), currency)}</td>
                  <td className="px-4 py-3 text-right text-muted">{Number(i.rate)}%</td>
                  <td className="px-4 py-3 text-muted">{INVESTMENT_STATUS_LABEL[i.status] ?? i.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Intereses — misma tabla `InvestmentInterest` que generó el asiento contable (cuenta 4902). */
async function InteresesTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const interests = await listInvestmentInterests(companyId, condoId);
  const total = round2(interests.reduce((s, i) => s + Number(i.amount), 0));

  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Inversión</th>
              <th className="px-4 py-3">Fondo</th>
              <th className="px-4 py-3 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {interests.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">Sin intereses registrados todavía.</td>
              </tr>
            ) : (
              interests.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">{i.date.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-ink">{i.investment.institution}</td>
                  <td className="px-4 py-3 text-muted">{i.fund.name}</td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-ok">{fmt(Number(i.amount), currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          {interests.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-4 py-3" colSpan={3}>Total — ingreso financiero (cuenta 4902)</td>
                <td className="px-4 py-3 text-right">{fmt(total, currency)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Activos — misma `listAssets`/`listAssetBookValues` que `/app/activos`. */
async function ActivosReportTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const [assets, bookValues] = await Promise.all([
    listAssets(companyId, condoId),
    listAssetBookValues(companyId, condoId),
  ]);

  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Adquisición</th>
              <th className="px-4 py-3 text-right">Valor en libros</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">Sin activos registrados todavía.</td>
              </tr>
            ) : (
              assets.map((a) => {
                const accumulated = round2(bookValues.get(a.id) ?? 0);
                const acquisitionValue = a.acquisitionValue !== null ? Number(a.acquisitionValue) : null;
                const bookValue =
                  acquisitionValue !== null ? round2(Math.max(Number(a.residualValue ?? 0), acquisitionValue - accumulated)) : null;
                return (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-royal">{a.code}</td>
                    <td className="px-4 py-3 text-ink">{a.name}</td>
                    <td className="px-4 py-3 text-muted">{ASSET_STATUS_LABEL[a.status] ?? a.status}</td>
                    <td className="px-4 py-3 text-right text-ink">{acquisitionValue !== null ? fmt(acquisitionValue, currency) : '—'}</td>
                    <td className="px-4 py-3 text-right font-sans font-semibold text-ink">
                      {bookValue !== null ? fmt(bookValue, currency) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Depreciaciones — misma tabla `AssetDepreciationEntry` que generó el asiento contable (cuentas 5902/1502). */
async function DepreciacionesTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const entries = await listDepreciationEntries(companyId, condoId);
  const total = round2(entries.reduce((s, e) => s + Number(e.amount), 0));

  return (
    <div>
      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3 text-right">Depreciación</th>
              <th className="px-4 py-3 text-right">Acumulada</th>
              <th className="px-4 py-3 text-right">Valor en libros</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">Sin depreciaciones registradas todavía.</td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-muted">{e.period}</td>
                  <td className="px-4 py-3 text-ink">{e.asset.code} · {e.asset.name}</td>
                  <td className="px-4 py-3 text-right text-warn">{fmt(Number(e.amount), currency)}</td>
                  <td className="px-4 py-3 text-right text-muted">{fmt(Number(e.accumulatedAfter), currency)}</td>
                  <td className="px-4 py-3 text-right font-sans font-semibold text-ink">{fmt(Number(e.bookValueAfter), currency)}</td>
                </tr>
              ))
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line font-bold text-ink">
                <td className="px-4 py-3" colSpan={2}>Total — gasto por depreciación (cuenta 5902)</td>
                <td className="px-4 py-3 text-right">{fmt(total, currency)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/**
 * Presupuesto — misma `getBudget` que `Finanzas → Presupuesto`, y por
 * lo tanto el mismo "Ejecutado" que el total de la pestaña Egresos.
 */
async function PresupuestoReportTab({ companyId, searchParams }: { companyId: string; searchParams: SearchParams }) {
  const session = await auth();
  const { condos, condoId } = await resolveSingleCondo(session!, searchParams);
  if (!condoId) return <SinCondominios />;
  const condo = await getCondominium(companyId, condoId);
  const currency = condo?.currency ?? 'CRC';
  const year = Number(searchParams.anio) || new Date().getUTCFullYear();
  const budget = await getBudget(companyId, condoId, year);

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <YearSelect tab="presupuesto" condoId={condoId} year={year} years={recentYears(year)} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Kpi label="Presupuestado" value={fmt(budget.totalBudgeted, currency)} />
        <Kpi label="Ejecutado" value={fmt(budget.totalExecuted, currency)} />
        <Kpi label="Disponible" value={fmt(round2(budget.totalBudgeted - budget.totalExecuted), currency)} />
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Presupuestado</th>
              <th className="px-4 py-3 text-right">Ejecutado</th>
              <th className="px-4 py-3 text-right">Variación</th>
              <th className="px-4 py-3 text-right">% Avance</th>
            </tr>
          </thead>
          <tbody>
            {budget.rows.filter((r) => r.budgeted > 0 || r.executed > 0).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">Sin presupuesto ni ejecución para {year}.</td>
              </tr>
            ) : (
              budget.rows
                .filter((r) => r.budgeted > 0 || r.executed > 0)
                .map((r) => (
                  <tr key={r.accountId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-ink">{r.code} · {r.name}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.budgeted, currency)}</td>
                    <td className="px-4 py-3 text-right">{fmt(r.executed, currency)}</td>
                    <td className={`px-4 py-3 text-right ${r.available < 0 ? 'text-danger' : 'text-ink'}`}>{fmt(r.available, currency)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.percent >= 100 ? 'text-danger' : r.percent >= 80 ? 'text-warn' : 'text-ok'}`}>
                      {/* Sin presupuesto no hay avance que medir: un "0 %" al lado
                          de un ejecutado se lee como "no se gastó nada". */}
                      {r.budgeted > 0 ? `${r.percent}%` : <span className="text-muted">sin presupuesto</span>}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
