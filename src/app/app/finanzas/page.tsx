import { Wallet, AlertTriangle, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can, canConfigureWater } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance, getCondoFinanceSummary } from '@/lib/services/finance';
import { getWaterBoard, periodStart } from '@/lib/services/water';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { FinanceTabs } from './finance-tabs';
import { DescargarReporte } from './descargar-reporte';
import { GenerateBillingForm } from './generate-billing-form';
import { PropertyBalanceRow } from './property-balance-row';
import { FinanceStatusCards, type UnitStatusRow } from './status-cards';
import { WaterBilling } from './water-billing';

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: { condoId?: string; aguaMes?: string };
}) {
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
      <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />
    );
  }

  const condo = condos.find((c) => c.id === condoId)!;

  // Período del cobro de agua: por defecto el mes ANTERIOR — la
  // lectura del medidor se toma cuando el mes ya cerró.
  const hoy = new Date();
  const mesAnterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1));
  const aguaMes = /^\d{4}-\d{2}$/.test(searchParams.aguaMes ?? '')
    ? searchParams.aguaMes!
    : `${mesAnterior.getUTCFullYear()}-${String(mesAnterior.getUTCMonth() + 1).padStart(2, '0')}`;
  const [aguaYear, aguaMonth] = aguaMes.split('-').map(Number);

  const [properties, summary, water] = await Promise.all([
    listPropertiesWithBalance(session!.user.companyId, condoId!),
    getCondoFinanceSummary(session!.user.companyId, condoId!),
    getWaterBoard(session!.user.companyId, condoId!, periodStart(aguaYear!, aguaMonth!)),
  ]);

  return (
    <div>
      <PageHeader title="Finanzas y Contabilidad" subtitle="Cuotas, cargos, pagos y morosidad — y su reflejo contable automático" />
      <FinanceTabs />

      <div className="flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId!} />
        <DescargarReporte tab="cuotas" condoId={condoId!} />
      </div>

      {condo.status !== 'activo' && (
        <div className="card mt-4 flex items-center gap-3 border-warn/30 bg-warn-bg/40 p-4 text-sm">
          <AlertTriangle size={18} className="flex-none text-warn" />
          <span>
            {condo.name} está en configuración — actívalo desde su ficha en Gestión de Condominios antes
            de facturar.
          </span>
        </div>
      )}

      {/*
        Al día / morosidad se listan con el MISMO criterio del KPI
        (v_condo_finance_kpis: saldo <= 0 es al día) — mismos datos ya
        cargados para la tabla, así el conteo y el detalle nunca
        difieren.
      */}
      <FinanceStatusCards
        condominiumId={condoId!}
        currency={condo.currency}
        canManage={session!.user.role === 'admin_owner'}
        totalUnits={Number(summary.total_units)}
        alDia={properties.filter((p) => p.balance <= 0).map(toStatusRow)}
        morosos={properties.filter((p) => p.balance > 0).map(toStatusRow)}
      />

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

      <WaterBilling
        condominiumId={condoId!}
        currency={condo.currency}
        period={aguaMes}
        config={{ mode: water.mode, flatFee: water.flatFee, tiers: water.tiers }}
        rows={water.rows}
        canConfigure={canConfigureWater(session)}
      />

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

function toStatusRow(p: {
  id: string;
  code: string;
  ownerName: string | null;
  balance: number;
  monthsOverdue: number;
  hasPaymentPlan: boolean;
  suspended: boolean;
  manualSuspension: boolean;
}): UnitStatusRow {
  return {
    propertyId: p.id,
    code: p.code,
    ownerName: p.ownerName,
    balance: p.balance,
    monthsOverdue: p.monthsOverdue,
    hasPaymentPlan: p.hasPaymentPlan,
    suspended: p.suspended,
    manualSuspension: p.manualSuspension,
  };
}
