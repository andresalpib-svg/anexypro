import { Lock, FileSpreadsheet } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getFinancialReport, getDelinquencyReport, getMaintenanceReport, getProjectsReport } from '@/lib/services/reports';
import { PageHeader } from '@/components/ui/page-header';
import { ReportTabsNav } from './tabs';
import { ExplainWithAI } from './explain-with-ai';
import { ViolationsTab } from './violations-tab';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { resolveCondoId } from '@/lib/active-condo';

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: {
    tab?: string;
    condoId?: string;
    estado?: string;
    tipo?: string;
    desde?: string;
    hasta?: string;
    conMulta?: string;
    reincidencias?: string;
  };
}) {
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

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Consolidado de todos los condominios activos — nunca mezcla monedas distintas en un mismo total"
        action={
          <a href={`/app/reportes/exportar?tab=${tab}${tab === 'incumplimientos' ? `&condoId=${searchParams.condoId ?? ''}` : ''}`} className="btn-ghost">
            <FileSpreadsheet size={16} /> Descargar Excel
          </a>
        }
      />
      <ReportTabsNav tab={tab} />
      <ExplainWithAI tab={tab} />

      {tab === 'financiero' && <FinancieroTab companyId={companyId} />}
      {tab === 'morosidad' && <MorosidadTab companyId={companyId} />}
      {tab === 'mantenimiento' && <MantenimientoTab companyId={companyId} />}
      {tab === 'proyectos' && <ProyectosTab companyId={companyId} />}
      {tab === 'incumplimientos' && <IncumplimientosTab companyId={companyId} searchParams={searchParams} />}
    </div>
  );
}

async function FinancieroTab({ companyId }: { companyId: string }) {
  const rows = await getFinancialReport(companyId);
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

async function MorosidadTab({ companyId }: { companyId: string }) {
  const rows = await getDelinquencyReport(companyId);
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

async function MantenimientoTab({ companyId }: { companyId: string }) {
  const r = await getMaintenanceReport(companyId);
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Kpi label="Tickets totales" value={r.total} />
      <Kpi label="Preventivos" value={r.preventivos} />
      <Kpi label="Completados" value={r.byStatus.completado ?? 0} />
      <Kpi label="Costo acumulado" value={new Intl.NumberFormat('es-CR').format(r.totalCost)} />
    </div>
  );
}

async function ProyectosTab({ companyId }: { companyId: string }) {
  const rows = await getProjectsReport(companyId);
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
                <td className="px-4 py-3 text-muted">{p.status}</td>
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


/**
 * El reporte de incumplimientos va por condominio —el módulo es por
 * condominio—, así que resuelve el Condominio Activo igual que las
 * demás pantallas del panel.
 */
async function IncumplimientosTab({
  companyId,
  searchParams,
}: {
  companyId: string;
  searchParams: { condoId?: string; estado?: string; tipo?: string; desde?: string; hasta?: string; conMulta?: string; reincidencias?: string };
}) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) {
    return <div className="card mt-5 p-10 text-center text-sm text-muted">No hay condominios disponibles.</div>;
  }
  return <ViolationsTab companyId={companyId} condominiumId={condoId} filtros={searchParams} />;
}
