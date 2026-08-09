import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { getCollectionsView, listPaymentPlans } from '@/lib/services/collections';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { CollectionsBoard, type DebtorView, type PlanView } from './collections-board';

export default async function CobranzaPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [view, plans, condo] = await Promise.all([
    getCollectionsView(session!.user.companyId, condoId),
    listPaymentPlans(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Morosidad por antigüedad, gestión de cobro y convenios de pago"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <CollectionsBoard
        condominiumId={condoId}
        currency={condo?.currency ?? 'CRC'}
        canManage={['admin_owner', 'admin_staff'].includes(session!.user.role)}
        collectionRate={view.collectionRate}
        aging={{
          totals: view.aging.totals,
          total: view.aging.total,
          overdue: view.aging.overdue,
          overdueRatio: view.aging.overdueRatio,
        }}
        debtors={view.debtors.map(
          (d): DebtorView => ({
            propertyId: d.propertyId,
            code: d.code,
            ownerName: d.ownerName,
            total: d.total,
            oldestDays: d.oldestDays,
            buckets: d.buckets,
            hasPlan: d.hasPlan,
            lastAction: d.lastAction ? { type: d.lastAction.type, at: d.lastAction.at.toISOString() } : null,
            suggestedStep: d.suggestedStep,
          })
        )}
        plans={plans.map(
          (p): PlanView => ({
            id: p.id,
            propertyCode: p.property.code,
            totalDebt: Number(p.totalDebt),
            downPayment: Number(p.downPayment),
            installments: p.installments,
            startDate: p.startDate.toISOString(),
            status: p.status,
          })
        )}
      />
    </div>
  );
}
