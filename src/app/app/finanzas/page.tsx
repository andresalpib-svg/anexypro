import { Wallet, Building2, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance, getCondoFinanceSummary } from '@/lib/services/finance';
import { PageHeader } from '@/components/ui/page-header';
import { CondoSelect } from '../propiedades/condo-select';
import { FinanceTabs } from './finance-tabs';
import { GenerateBillingForm } from './generate-billing-form';
import { PropertyBalanceRow } from './property-balance-row';

export default async function FinanzasPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();

  if (!can(session, 'finanzas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Finanzas</p>
        <p className="mt-1 text-sm text-muted">
          Tu cuenta de staff no tiene permiso para esta área. Pídele a un administrador que te lo
          otorgue desde Configuración.
        </p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = searchParams.condoId ?? condos.find((c) => c.status === 'activo')?.id ?? condos[0]?.id;

  if (condos.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-muted">
        Primero crea un condominio en Gestión de Condominios.
      </div>
    );
  }

  const condo = condos.find((c) => c.id === condoId)!;
  const [properties, summary] = await Promise.all([
    listPropertiesWithBalance(session!.user.companyId, condoId!),
    getCondoFinanceSummary(session!.user.companyId, condoId!),
  ]);

  return (
    <div>
      <PageHeader title="Finanzas y Contabilidad" subtitle="Cuotas, cargos, pagos y morosidad — y su reflejo contable automático" />
      <FinanceTabs />

      <CondoSelect condos={condos} selected={condoId!} />

      {condo.status !== 'activo' && (
        <div className="card mt-4 flex items-center gap-3 border-warn/30 bg-warn-bg/40 p-4 text-sm">
          <AlertTriangle size={18} className="flex-none text-warn" />
          <span>
            {condo.name} está en configuración — actívalo desde su ficha en Gestión de Condominios antes
            de facturar.
          </span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi icon={Building2} color="bg-royal" label="Unidades" value={Number(summary.total_units)} />
        <Kpi icon={CheckCircle2} color="bg-ok" label="Al día" value={Number(summary.units_current)} />
        <Kpi icon={AlertTriangle} color="bg-danger" label="En morosidad" value={Number(summary.units_delinquent)} />
      </div>

      <div className="card mt-4 p-5">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <Wallet size={14} /> Facturación ordinaria
        </p>
        <p className="mb-3 text-sm text-muted">
          Solo la cuota condominal ordinaria se genera de forma masiva por período — el resto de cargos
          (extraordinarias, agua, multas, quick pass…) siempre se registra manualmente por unidad, sin
          excepción.
        </p>
        <GenerateBillingForm condominiumId={condoId!} />
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {properties.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  Sin unidades activas en este condominio.
                </td>
              </tr>
            ) : (
              properties.map((p) => (
                <PropertyBalanceRow key={p.id} property={p} condominiumId={condoId!} currency={condo.currency} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-5">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${color}`}>
        <Icon size={20} />
      </span>
      <p className="mt-3 font-sans text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-sm font-medium text-muted">{label}</p>
    </div>
  );
}
