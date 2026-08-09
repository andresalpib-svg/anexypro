import Link from 'next/link';
import {
  Lock, AlertTriangle, AlertCircle, Info, TrendingUp, TrendingDown,
  Wallet, Scale, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { getFinancialDashboard } from '@/lib/services/financial-dashboard';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { CashFlowChart } from '../flujo/cash-flow-chart';

const ALERT_STYLE = {
  critico: { icon: AlertTriangle, box: 'border-danger/40 bg-danger-bg/30', tone: 'text-danger' },
  atencion: { icon: AlertCircle, box: 'border-warn/40 bg-warn-bg/30', tone: 'text-warn' },
  info: { icon: Info, box: 'border-line bg-canvas', tone: 'text-muted' },
} as const;

const STATUS_TONE = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  neutral: 'text-muted',
} as const;

const BUCKETS = [
  { key: 'corriente', label: 'Al día', tone: 'bg-ok' },
  { key: 'd1_30', label: '1-30 d', tone: 'bg-lumen' },
  { key: 'd31_60', label: '31-60 d', tone: 'bg-warn' },
  { key: 'd61_90', label: '61-90 d', tone: 'bg-danger/70' },
  { key: 'd90_mas', label: '+90 d', tone: 'bg-danger' },
];

export default async function PanelFinancieroPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'finanzas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Finanzas</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;

  const [data, condo] = await Promise.all([
    getFinancialDashboard(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);
  const currency = condo?.currency ?? 'CRC';
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  const variacion = (v: number | null) =>
    v === null ? null : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(1)}% vs. mes anterior`;

  const totalAging = data.aging.total || 1;

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle={`Panel financiero de ${condo?.name ?? 'tu condominio'}`}
      />
      <FinanceTabs />
      <div className="mb-4 mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      {/* ---------- Alertas: lo que exige acción va primero ---------- */}
      {data.alerts.length > 0 ? (
        <div className="space-y-2">
          {data.alerts.slice(0, 5).map((a, i) => {
            const s = ALERT_STYLE[a.level];
            const Icon = s.icon;
            return (
              <Link key={i} href={`${a.href}?condoId=${condoId}`} className={`card flex items-start gap-3 border p-3.5 transition hover:shadow-md ${s.box}`}>
                <Icon size={17} className={`mt-0.5 flex-none ${s.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{a.title}</p>
                  <p className="text-xs text-muted">{a.detail}</p>
                </div>
                <ArrowRight size={15} className="mt-0.5 flex-none text-muted" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card flex items-center gap-3 border-ok/30 bg-ok/5 p-4">
          <CheckCircle2 size={18} className="flex-none text-ok" />
          <p className="text-sm text-ink">Sin asuntos que requieran atención. Las finanzas están en orden.</p>
        </div>
      )}

      {/* ---------- KPIs ---------- */}
      <div className="mt-4 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        {[
          { label: 'Ingresos del mes', value: fmt(data.kpis.income), var: variacion(data.kpis.incomeVar), icon: TrendingUp, color: 'bg-ok/15 text-ok' },
          { label: 'Gastos del mes', value: fmt(data.kpis.expense), var: variacion(data.kpis.expenseVar), icon: TrendingDown, color: 'bg-warn-bg text-warn' },
          { label: 'Resultado del mes', value: fmt(data.kpis.result), var: null, icon: Scale, color: data.kpis.result >= 0 ? 'bg-ok/15 text-ok' : 'bg-danger-bg text-danger' },
          { label: `En bancos (${data.kpis.bankCount})`, value: fmt(data.kpis.bankBalance), var: null, icon: Wallet, color: 'bg-royal-soft text-royal' },
        ].map((k) => (
          <div key={k.label} className="card p-5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${k.color}`}>
              <k.icon size={18} />
            </span>
            <p className="mt-3 font-sans text-xl font-bold text-ink">{k.value}</p>
            <p className="text-sm text-muted">{k.label}</p>
            {k.var && <p className="mt-0.5 text-[.7rem] text-muted">{k.var}</p>}
          </div>
        ))}
      </div>

      {/* ---------- Flujo + morosidad ---------- */}
      <div className="mt-4 grid grid-cols-[3fr_2fr] gap-4 max-lg:grid-cols-1">
        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Flujo de caja</p>
          <CashFlowChart months={data.cashFlow.months} currency={currency} />
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Morosidad por antigüedad</p>
          <div className="space-y-2">
            {BUCKETS.map((b) => {
              const v = data.aging.totals[b.key as keyof typeof data.aging.totals] ?? 0;
              const pct = (v / totalAging) * 100;
              return (
                <div key={b.key} className="flex items-center gap-2 text-sm">
                  <span className="w-16 flex-none text-xs text-muted">{b.label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div className={`h-full rounded-full ${b.tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 flex-none text-right text-xs text-muted">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-sm text-ink">
              Cartera: <b>{fmt(data.aging.total)}</b>
            </p>
            <p className="text-xs text-muted">
              {fmt(data.aging.overdue)} vencida en {data.debtorCount} filial(es)
            </p>
            <Link href={`/app/finanzas/cobranza?condoId=${condoId}`} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-royal hover:underline">
              Ir a cobranza <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* ---------- Presupuesto + indicadores ---------- */}
      <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Presupuesto vs. ejecución</p>
          {data.budget.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              Todavía no hay presupuesto para este año.{' '}
              <Link href={`/app/finanzas/presupuesto?condoId=${condoId}`} className="font-semibold text-royal hover:underline">
                Configuralo acá.
              </Link>
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.budget.map((r) => (
                <div key={r.accountId} className="flex items-center gap-2 text-sm">
                  <span className="w-36 flex-none truncate text-xs text-ink">{r.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={`h-full rounded-full ${r.percent >= 120 ? 'bg-danger' : r.percent >= 100 ? 'bg-danger/70' : r.percent >= 80 ? 'bg-warn' : 'bg-ok'}`}
                      style={{ width: `${Math.min(100, r.percent)}%` }}
                    />
                  </div>
                  <span className={`w-12 flex-none text-right text-xs ${r.percent >= 100 ? 'font-semibold text-danger' : 'text-muted'}`}>
                    {Math.round(r.percent)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Indicadores financieros</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.indicators.map((i) => (
              <div key={i.key}>
                <p className="text-xs text-muted">{i.label}</p>
                <p className={`font-sans text-lg font-bold ${STATUS_TONE[i.status]}`}>{i.value}</p>
                <p className="text-[.65rem] leading-tight text-muted">{i.hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Bandejas ---------- */}
      <div className="mt-4 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <Tray
          title="Esperan aprobación"
          count={data.pendingApproval.length}
          href={`/app/finanzas/gastos?condoId=${condoId}`}
          empty="Nada pendiente de aprobar."
        >
          {data.pendingApproval.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">
                #{e.number} {e.description}
              </span>
              <span className="flex-none font-sans font-bold text-ink">{fmt(e.total)}</span>
            </li>
          ))}
        </Tray>

        <Tray
          title="Por pagar"
          count={data.payable.length}
          href={`/app/finanzas/gastos?condoId=${condoId}`}
          empty="Sin cuentas por pagar."
        >
          {data.payable.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink">
                #{e.number} {e.description}
              </span>
              <span className="flex-none font-sans font-bold text-warn">{fmt(e.pending)}</span>
            </li>
          ))}
        </Tray>

        <Tray
          title="Por conciliar"
          count={data.unreconciled}
          href={`/app/finanzas/bancos?condoId=${condoId}`}
          empty="Bancos conciliados al día."
        >
          <li className="px-4 py-4 text-sm text-muted">
            {data.unreconciled} movimiento(s) del banco todavía no coinciden con un registro del sistema.
          </li>
        </Tray>
      </div>
    </div>
  );
}

function Tray({
  title,
  count,
  href,
  empty,
  children,
}: {
  title: string;
  count: number;
  href: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
        <span className="rounded-full bg-royal-soft px-2 py-0.5 text-xs font-bold text-royal">{count}</span>
      </div>
      {count === 0 ? (
        <p className="flex-1 px-4 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex-1 divide-y divide-line">{children}</ul>
      )}
      <Link href={href} className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-royal hover:bg-canvas">
        Ver detalle <ArrowRight size={13} />
      </Link>
    </div>
  );
}
