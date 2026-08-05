import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { getBudget, listBudgetYears } from '@/lib/services/budget';
import { getReserveFund } from '@/lib/services/reserve-fund';
import { PageHeader } from '@/components/ui/page-header';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { BudgetBoard, type BudgetRowView } from './budget-board';
import { ReservePanel, type FundView, type MovementView } from './reserve-panel';

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
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero creá un condominio.</div>;

  const year = Number(searchParams.anio) || new Date().getUTCFullYear();
  const [budget, years, condo, reserve] = await Promise.all([
    getBudget(session!.user.companyId, condoId, year),
    listBudgetYears(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
    getReserveFund(session!.user.companyId, condoId),
  ]);
  const currency = condo?.currency ?? 'CRC';

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Presupuesto anual y su ejecución real"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <BudgetBoard
        condominiumId={condoId}
        year={year}
        years={years.includes(year) ? years : [year, ...years]}
        currency={currency}
        yearProgress={budget.yearProgress}
        canEdit={['admin_owner', 'contador'].includes(session!.user.role)}
        rows={budget.rows as BudgetRowView[]}
      />

      <ReservePanel
        condominiumId={condoId}
        currency={currency}
        canManage={session!.user.role === 'admin_owner'}
        fund={
          reserve
            ? ({
                id: reserve.fund.id,
                name: reserve.fund.name,
                targetAmount: reserve.summary.targetAmount,
                monthlyQuota: reserve.summary.monthlyQuota,
                contributed: reserve.summary.contributed,
                used: reserve.summary.used,
                balance: reserve.summary.balance,
                progress: reserve.summary.progress,
                monthsCovered: reserve.summary.monthsCovered,
              } satisfies FundView)
            : null
        }
        movements={
          reserve?.fund.movements.map(
            (m): MovementView => ({
              id: m.id,
              movType: m.movType,
              amount: Number(m.amount),
              movDate: m.movDate.toISOString(),
              description: m.description,
              reference: m.reference,
            })
          ) ?? []
        }
      />
    </div>
  );
}
