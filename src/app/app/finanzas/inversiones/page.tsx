import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { listInvestments } from '@/lib/services/investments';
import { listFunds } from '@/lib/services/funds';
import { listBankAccounts } from '@/lib/services/bank-accounts';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { InvestmentsBoard, type InvestmentRow, type FundOpt, type BankOpt } from './investments-board';

export default async function InversionesPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [investments, funds, banks, condo] = await Promise.all([
    listInvestments(session!.user.companyId, condoId),
    listFunds(session!.user.companyId, condoId),
    listBankAccounts(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Inversiones financieras del condominio — nunca se mezclan entre condominios"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <InvestmentsBoard
        condominiumId={condoId}
        currency={condo?.currency ?? 'CRC'}
        canManage={['admin_owner', 'admin_staff'].includes(session!.user.role)}
        investments={investments.map(
          (inv): InvestmentRow => ({
            id: inv.id,
            institution: inv.institution,
            investmentType: inv.investmentType,
            amount: Number(inv.amount),
            startDate: inv.startDate.toISOString(),
            maturityDate: inv.maturityDate?.toISOString() ?? null,
            rate: Number(inv.rate),
            status: inv.status,
            fundName: inv.fund.name,
            bankAccountName: inv.bankAccount?.name ?? null,
            totalInterest: inv.interestRecords.reduce((s, r) => s + Number(r.amount), 0),
          })
        )}
        funds={funds.map((f): FundOpt => ({ id: f.id, name: f.name, operativo: f.balance.operativo }))}
        banks={banks.map((b): BankOpt => ({ id: b.id, name: `${b.bankName} — ${b.name}` }))}
      />
    </div>
  );
}
