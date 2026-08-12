import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { listExpenses, listSuppliers, listBudgetLineOptions, CATEGORY_LABEL } from '@/lib/services/expenses';
import { listBankAccounts } from '@/lib/services/bank-accounts';
import { listProjects } from '@/lib/services/projects';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { DescargarReporte } from '../descargar-reporte';
import { ExpenseBoard, type ExpenseRow, type SupplierOpt, type BankOpt, type ProjectOpt } from './expense-board';

export default async function GastosPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [expenses, suppliers, banks, condo, projects, budgetOptions] = await Promise.all([
    listExpenses(session!.user.companyId, condoId),
    listSuppliers(session!.user.companyId),
    listBankAccounts(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
    listProjects(session!.user.companyId, condoId),
    listBudgetLineOptions(session!.user.companyId, condoId),
  ]);

  // Para rotular la línea presupuestaria de cada gasto en la tabla.
  const accountName = new Map(budgetOptions.map((o) => [o.code, o.name]));

  const role = session!.user.role;

  // Los proyectos cancelados no se ofrecen: no tiene sentido imputarles
  // gasto nuevo. Los terminados sí — una factura puede llegar después.
  const proyectosImputables = projects
    .filter((p) => p.status !== 'cancelado')
    .map((p): ProjectOpt => ({ id: p.id, name: p.name, status: p.status }));

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Gastos, proveedores y cuentas por pagar del condominio"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
        <DescargarReporte tab="gastos" condoId={condoId} />
      </div>

      <ExpenseBoard
        condominiumId={condoId}
        currency={condo?.currency ?? 'CRC'}
        canApprove={role === 'admin_owner'}
        canRegister={role !== 'contador'}
        categories={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
        suppliers={suppliers.map(
          (s): SupplierOpt => ({
            id: s.id,
            name: s.tradeName ?? s.legalName,
            defaultCategory: s.defaultCategory,
          })
        )}
        banks={banks.map((b): BankOpt => ({ id: b.id, name: `${b.bankName} — ${b.name}` }))}
        projects={proyectosImputables}
        budgetOptions={budgetOptions}
        expenses={expenses.map((e): ExpenseRow => {
          const paid = e.payments.reduce((s, p) => s + Number(p.amount), 0);
          return {
            id: e.id,
            number: e.expenseNumber,
            category: e.category,
            accountCode: e.accountCode,
            accountName: accountName.get(e.accountCode) ?? null,
            description: e.description,
            invoiceNumber: e.invoiceNumber,
            supplierName: e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : null,
            issueDate: e.issueDate.toISOString(),
            dueDate: e.dueDate?.toISOString() ?? null,
            total: Number(e.total),
            paid,
            status: e.status,
            documentUrl: e.documentUrl,
            documentName: e.documentName,
            createdByName: e.createdBy?.fullName ?? null,
            approvedByName: e.approvedBy?.fullName ?? null,
          };
        })}
      />
    </div>
  );
}
