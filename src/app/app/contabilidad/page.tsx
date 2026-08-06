import { Sparkles, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { getLibroDiario, getBalanceGeneral, getEstadoResultados } from '@/lib/services/accounting';
import { PageHeader } from '@/components/ui/page-header';
import { CondoSelect } from '../propiedades/condo-select';
import { FinanceTabs } from '../finanzas/finance-tabs';
import { ReportTabs } from './report-tabs';

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Capital',
  ingreso: 'Ingreso',
  gasto: 'Gasto',
};

function fmt(n: string | number, currency: string) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(n));
}

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: { condoId?: string; tab?: string };
}) {
  const session = await auth();
  if (!can(session, 'finanzas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Contabilidad</p>
        <p className="mt-1 text-sm text-muted">Pídele a un administrador que te otorgue esta área.</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) {
    return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;
  }
  const condo = condos.find((c) => c.id === condoId)!;
  const tab = searchParams.tab ?? 'diario';

  const [diario, balance, resultados] = await Promise.all([
    tab === 'diario' ? getLibroDiario(session!.user.companyId, condoId) : Promise.resolve([]),
    tab === 'balance' ? getBalanceGeneral(session!.user.companyId, condoId) : Promise.resolve([]),
    tab === 'resultados' ? getEstadoResultados(session!.user.companyId, condoId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title="Finanzas y Contabilidad" subtitle="Motor de partida doble con devengo real — cada operación de Finanzas genera su asiento" />
      <FinanceTabs />
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={14} className="text-lumen" />
        <span className="text-xs font-semibold text-lumen">
          El ingreso se reconoce al emitir el cargo, no al cobrarlo — misma política que un estado
          financiero real
        </span>
      </div>

      <div className="mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <ReportTabs condoId={condoId} tab={tab} />

      {tab === 'diario' && (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cuenta</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Débito</th>
                <th className="px-4 py-3 text-right">Crédito</th>
              </tr>
            </thead>
            <tbody>
              {diario.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">
                    Sin movimientos todavía — se generan automáticamente al emitir cuotas y registrar
                    pagos en Finanzas.
                  </td>
                </tr>
              ) : (
                diario.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-muted">{new Date(r.entry_date).toLocaleDateString('es-CR')}</td>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {r.code} · {r.name}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{r.description}</td>
                    <td className="px-4 py-2.5 text-right">{Number(r.debit) > 0 ? fmt(r.debit, condo.currency) : ''}</td>
                    <td className="px-4 py-2.5 text-right">{Number(r.credit) > 0 ? fmt(r.credit, condo.currency) : ''}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'balance' && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(['activo', 'pasivo', 'patrimonio'] as const).map((type) => {
            const rows = balance.filter((r) => r.type === type);
            if (type === 'patrimonio' && rows.length === 0) return null;
            return (
              <div key={type} className="card p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                  {ACCOUNT_TYPE_LABEL[type]}
                </p>
                {['corriente', 'no_corriente', null].map((sub) => {
                  const subset = rows.filter((r) => r.sub === sub);
                  if (subset.length === 0) return null;
                  return (
                    <div key={String(sub)} className="mb-3">
                      {sub && (
                        <p className="mb-1 text-[.68rem] font-semibold uppercase text-muted">
                          {sub === 'corriente' ? 'Corriente' : 'No corriente'}
                        </p>
                      )}
                      {subset.map((r) => (
                        <div key={r.code} className="flex justify-between py-1 text-sm">
                          <span className="text-ink">{r.name}</span>
                          <span className="font-medium text-ink">{fmt(r.balance, condo.currency)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {rows.length === 0 && <p className="text-sm text-muted">Sin saldo.</p>}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'resultados' && (
        <div className="card mt-4 p-5">
          {(() => {
            const ingOp = resultados.filter((r) => r.type === 'ingreso' && r.is_operating);
            const gastoOp = resultados.filter((r) => r.type === 'gasto' && r.is_operating);
            const ingNoOp = resultados.filter((r) => r.type === 'ingreso' && !r.is_operating);
            const gastoNoOp = resultados.filter((r) => r.type === 'gasto' && !r.is_operating);
            const totalIngOp = ingOp.reduce((s, r) => s + Number(r.balance), 0);
            const totalGastoOp = gastoOp.reduce((s, r) => s + Number(r.balance), 0);
            const utilOperativa = totalIngOp - totalGastoOp;
            const totalIngNoOp = ingNoOp.reduce((s, r) => s + Number(r.balance), 0);
            const totalGastoNoOp = gastoNoOp.reduce((s, r) => s + Number(r.balance), 0);
            const utilNeta = utilOperativa + totalIngNoOp - totalGastoNoOp;
            return (
              <>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Ingresos operativos</p>
                {ingOp.map((r) => (
                  <Row key={r.code} label={r.name} value={fmt(r.balance, condo.currency)} />
                ))}
                <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-muted">Gastos de operación</p>
                {gastoOp.map((r) => (
                  <Row key={r.code} label={r.name} value={fmt(r.balance, condo.currency)} />
                ))}
                <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-bold">
                  <span>Utilidad de operación</span>
                  <span className={utilOperativa >= 0 ? 'text-ok' : 'text-danger'}>{fmt(utilOperativa, condo.currency)}</span>
                </div>
                {(ingNoOp.length > 0 || gastoNoOp.length > 0) && (
                  <>
                    <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                      Otros ingresos y gastos financieros
                    </p>
                    {ingNoOp.map((r) => (
                      <Row key={r.code} label={r.name} value={'+' + fmt(r.balance, condo.currency)} />
                    ))}
                    {gastoNoOp.map((r) => (
                      <Row key={r.code} label={r.name} value={'-' + fmt(r.balance, condo.currency)} />
                    ))}
                  </>
                )}
                <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-bold">
                  <span>{utilNeta >= 0 ? 'Superávit' : 'Déficit'} del período</span>
                  <span className={utilNeta >= 0 ? 'text-ok' : 'text-danger'}>{fmt(Math.abs(utilNeta), condo.currency)}</span>
                </div>
                {resultados.length === 0 && <p className="py-6 text-center text-sm text-muted">Sin movimientos todavía.</p>}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-ink">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
