import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { getCloseChecks, listPeriods, periodOf } from '@/lib/services/accounting-periods';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { CloseBoard, type CheckView, type PeriodView } from './close-board';

export default async function CierrePage({
  searchParams,
}: {
  searchParams: { condoId?: string; periodo?: string };
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

  // Por defecto se propone cerrar el mes ANTERIOR: el mes en curso
  // todavía recibe movimientos.
  const prev = new Date();
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const period = /^\d{4}-\d{2}$/.test(searchParams.periodo ?? '') ? searchParams.periodo! : periodOf(prev);

  const [checks, periods] = await Promise.all([
    getCloseChecks(session!.user.companyId, condoId, period),
    listPeriods(session!.user.companyId, condoId),
  ]);

  const current = periods.find((p) => p.period === period);

  return (
    <div>
      <PageHeader title="Finanzas y Contabilidad" subtitle="Cierre mensual — congela los estados financieros" />
      <FinanceTabs />
      <div className="mb-4 mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <CloseBoard
        condominiumId={condoId}
        period={period}
        isClosed={current?.status === 'cerrado'}
        canClose={session!.user.role === 'admin_owner'}
        checks={checks as CheckView[]}
        periods={periods.map(
          (p): PeriodView => ({
            period: p.period,
            status: p.status,
            closedAt: p.closedAt?.toISOString() ?? null,
            closedBy: p.closedBy?.fullName ?? null,
          })
        )}
      />
    </div>
  );
}
