import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { getBudget, listBudgetYears } from '@/lib/services/budget';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { DescargarReporte } from '../descargar-reporte';
import { BudgetBoard, type BudgetRowView } from './budget-board';

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: { condoId?: string; anio?: string };
}) {
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

  const year = Number(searchParams.anio) || new Date().getUTCFullYear();
  const [budget, years, condo] = await Promise.all([
    getBudget(session!.user.companyId, condoId, year),
    listBudgetYears(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);
  const currency = condo?.currency ?? 'CRC';

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Presupuesto anual y su ejecución real"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <DescargarReporte tab="presupuesto" condoId={condoId} />
      </div>

      <BudgetBoard
        condominiumId={condoId}
        year={year}
        years={years.includes(year) ? years : [year, ...years]}
        currency={currency}
        yearProgress={budget.yearProgress}
        canEdit={['admin_owner', 'contador'].includes(session!.user.role)}
        rows={budget.rows as BudgetRowView[]}
        totalExecuted={budget.totalExecuted}
      />
    </div>
  );
}
