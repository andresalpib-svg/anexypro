import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listBankAccountsWithBalance, listAssetAccounts } from '@/lib/services/bank-accounts';
import { getReconciliationView } from '@/lib/services/bank-reconciliation';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { DescargarReporte } from '../descargar-reporte';
import {
  ReconciliationBoard,
  type AccountRow,
  type TxRow,
  type CandidateRow,
} from './reconciliation-board';

export default async function BancosPage({
  searchParams,
}: {
  searchParams: { condoId?: string; cuenta?: string };
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

  const [accounts, assetAccounts] = await Promise.all([
    listBankAccountsWithBalance(session!.user.companyId, condoId),
    listAssetAccounts(session!.user.companyId, condoId),
  ]);

  const selected = accounts.find((a) => a.id === searchParams.cuenta) ?? accounts[0] ?? null;
  const view = selected ? await getReconciliationView(session!.user.companyId, selected.id) : null;

  const candidates: CandidateRow[] = view
    ? [
        ...view.payments.map((p): CandidateRow => ({
          id: p.id,
          type: 'payment',
          date: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          label: `Pago ${p.property.code}`,
          reference: p.reference,
        })),
        ...view.expensePayments.map((e): CandidateRow => ({
          id: e.id,
          type: 'expense_payment',
          date: e.paymentDate.toISOString(),
          amount: Number(e.amount),
          label: `Gasto #${e.expense.expenseNumber} — ${e.expense.description}`,
          reference: e.reference,
        })),
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Cuentas bancarias y conciliación automática de movimientos"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <DescargarReporte tab="bancos" condoId={condoId} />
      </div>

      <ReconciliationBoard
        condominiumId={condoId}
        canManage={session!.user.role === 'admin_owner'}
        assetAccounts={assetAccounts}
        selectedId={selected?.id ?? null}
        accounts={accounts.map(
          (a): AccountRow => ({
            id: a.id,
            name: a.name,
            bankName: a.bankName,
            accountNumber: a.accountNumber,
            currency: a.currency,
            balance: a.balance,
            accountCode: a.accountCode,
          })
        )}
        transactions={
          view?.transactions.map(
            (t): TxRow => ({
              id: t.id,
              date: t.txDate.toISOString(),
              description: t.description,
              reference: t.reference,
              amount: Number(t.amount),
              status: t.status,
              matchedType: t.matchedType,
              matchedId: t.matchedId,
              confidence: t.matchConfidence,
            })
          ) ?? []
        }
        candidates={candidates}
        totals={view?.totals ?? { conciliado: 0, propuesto: 0, pendiente: 0, ignorado: 0 }}
      />
    </div>
  );
}
