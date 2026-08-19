import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { listFunds, listFundMovements } from '@/lib/services/funds';
import { listAssetAccounts } from '@/lib/services/bank-accounts';
import { listProjects } from '@/lib/services/projects';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { FundsBoard, type FundView, type MovementView } from './funds-board';

export default async function FondosPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [funds, movements, assetAccounts, projects, condo] = await Promise.all([
    listFunds(session!.user.companyId, condoId),
    listFundMovements(session!.user.companyId, condoId),
    listAssetAccounts(session!.user.companyId, condoId),
    listProjects(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);

  const movementsByFund: Record<string, MovementView[]> = {};
  for (const m of movements) {
    const arr = movementsByFund[m.fundId] ?? [];
    arr.push({
      id: m.id,
      movType: m.movType,
      amount: Number(m.amount),
      movDate: m.movDate.toISOString(),
      description: m.description,
      reference: m.reference,
      investmentId: m.investmentId,
      voidedAt: m.voidedAt ? m.voidedAt.toISOString() : null,
      voidReason: m.voidReason,
    });
    movementsByFund[m.fundId] = arr;
  }

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Fondos del condominio — operativo, reserva, especiales, proyectos y otros"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <FundsBoard
        condominiumId={condoId}
        currency={condo?.currency ?? 'CRC'}
        canManage={['admin_owner', 'admin_staff'].includes(session!.user.role)}
        funds={funds.map(
          (f): FundView => ({
            id: f.id,
            type: f.type,
            name: f.name,
            targetAmount: f.targetAmount !== null ? Number(f.targetAmount) : null,
            monthlyQuota: Number(f.monthlyQuota),
            accountCode: f.accountCode,
            projectId: f.projectId,
            projectName: f.project?.name ?? null,
            balance: f.balance,
          })
        )}
        movementsByFund={movementsByFund}
        assetAccounts={assetAccounts}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
