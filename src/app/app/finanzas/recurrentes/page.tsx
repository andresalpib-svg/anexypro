import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { listRecurring, listContracts } from '@/lib/services/recurring';
import { listSuppliers, CATEGORY_LABEL } from '@/lib/services/expenses';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { DescargarReporte } from '../descargar-reporte';
import {
  RecurringBoard,
  type RecurringRow,
  type ContractRow,
  type SupplierOpt,
} from './recurring-board';

export default async function RecurrentesPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [recurring, contracts, suppliers, condo] = await Promise.all([
    listRecurring(session!.user.companyId, condoId),
    listContracts(session!.user.companyId, condoId),
    listSuppliers(session!.user.companyId),
    getCondominium(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Gastos que se repiten y contratos con proveedores"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <DescargarReporte tab="recurrentes" condoId={condoId} />
      </div>

      <RecurringBoard
        condominiumId={condoId}
        currency={condo?.currency ?? 'CRC'}
        canManage={session!.user.role === 'admin_owner'}
        categories={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
        suppliers={suppliers.map((s): SupplierOpt => ({ id: s.id, name: s.tradeName ?? s.legalName }))}
        recurring={recurring.map(
          (r): RecurringRow => ({
            id: r.id,
            description: r.description,
            category: r.category,
            supplierName: r.supplier ? (r.supplier.tradeName ?? r.supplier.legalName) : null,
            amount: Number(r.amount),
            frequency: r.frequency,
            dayOfMonth: r.dayOfMonth,
            leadDays: r.leadDays,
            startDate: r.startDate.toISOString(),
            endDate: r.endDate?.toISOString() ?? null,
            isActive: r.isActive,
            lastGenerated: r.lastGenerated?.toISOString() ?? null,
          })
        )}
        contracts={contracts.map(
          (c): ContractRow => ({
            id: c.id,
            title: c.title,
            serviceType: c.serviceType,
            supplierName: c.supplier.tradeName ?? c.supplier.legalName,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
            monthlyAmount: c.monthlyAmount !== null ? Number(c.monthlyAmount) : null,
            autoRenew: c.autoRenew,
            noticeDays: c.noticeDays,
            status: c.status,
            documentUrl: c.documentUrl,
            documentName: c.documentName,
          })
        )}
      />
    </div>
  );
}
