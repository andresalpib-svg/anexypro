import { Lock, TrendingUp, TrendingDown, Wallet, Timer } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { getCashFlow } from '@/lib/services/cash-flow';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { DescargarReporte } from '../descargar-reporte';
import { CashFlowChart } from './cash-flow-chart';

export default async function FlujoPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [flow, condo] = await Promise.all([
    getCashFlow(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);
  const currency = condo?.currency ?? 'CRC';
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const real = flow.months.filter((m) => !m.projected);
  const ultimo = real[real.length - 1];
  const liquidez = flow.runwayMonths;

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Flujo de caja real y proyección de los próximos meses"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <DescargarReporte tab="flujo" condoId={condoId} />
      </div>

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-soft text-royal">
            <Wallet size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{fmt(flow.currentBalance)}</p>
          <p className="text-sm text-muted">Saldo en bancos</p>
        </div>
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/15 text-ok">
            <TrendingUp size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{fmt(ultimo?.income ?? 0)}</p>
          <p className="text-sm text-muted">Ingresos del mes</p>
        </div>
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-bg text-warn">
            <TrendingDown size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{fmt(ultimo?.expense ?? 0)}</p>
          <p className="text-sm text-muted">Gastos del mes</p>
        </div>
        <div className={`card p-5 ${liquidez !== null && liquidez < 1 ? 'border-danger/40' : ''}`}>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              liquidez === null ? 'bg-canvas text-muted' : liquidez >= 2 ? 'bg-ok/15 text-ok' : liquidez >= 1 ? 'bg-warn-bg text-warn' : 'bg-danger-bg text-danger'
            }`}
          >
            <Timer size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">
            {liquidez === null ? '—' : `${liquidez.toFixed(1)}`}
          </p>
          <p className="text-sm text-muted">Meses de operación cubiertos</p>
        </div>
      </div>

      <div className="card mt-5 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
          Flujo de caja — 12 meses reales y 6 proyectados
        </p>
        <CashFlowChart months={flow.months} currency={currency} />
      </div>

      <div className="card mt-4 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Cómo se calcula la proyección</p>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          El ingreso proyectado NO asume que todos paguen: se aplica la tasa de recuperación real de este
          condominio, que hoy es de <b>{Math.round(flow.collectionRate * 100)}%</b> de lo facturado. El gasto
          proyectado usa el promedio mensual de los últimos meses ({fmt(flow.averageExpense)}).
        </p>
        {liquidez !== null && liquidez < 2 && (
          <p className="mt-2 rounded-lg bg-warn-bg/50 px-3 py-2 text-sm text-ink">
            <b>Atención:</b> el saldo actual cubre {liquidez.toFixed(1)} mes(es) de operación. Conviene revisar
            la cobranza o postergar gastos no urgentes.
          </p>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3 text-right">Ingresos</th>
              <th className="px-4 py-3 text-right">Gastos</th>
              <th className="px-4 py-3 text-right">Resultado</th>
              <th className="px-4 py-3 text-right">Saldo acumulado</th>
            </tr>
          </thead>
          <tbody>
            {flow.months.map((m) => (
              <tr key={m.period} className={`border-b border-line last:border-0 ${m.projected ? 'bg-canvas/50' : ''}`}>
                <td className="px-4 py-2.5">
                  {m.label}
                  {m.projected && <span className="ml-2 text-[.65rem] uppercase text-muted">proyectado</span>}
                </td>
                <td className="px-4 py-2.5 text-right text-ok">{fmt(m.income)}</td>
                <td className="px-4 py-2.5 text-right text-warn">{fmt(m.expense)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${m.net >= 0 ? 'text-ink' : 'text-danger'}`}>
                  {fmt(m.net)}
                </td>
                <td className="px-4 py-2.5 text-right font-sans font-bold text-ink">{fmt(m.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
