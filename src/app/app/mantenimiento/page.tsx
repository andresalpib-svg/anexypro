import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listAssets, listAssetCategories, listProviders } from '@/lib/services/maintenance';
import { getPettyCash } from '@/lib/services/petty-cash';
import { getCondominium } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { QuickAddAsset, QuickAddProvider } from './quick-add';
import { AssetList, ProviderList } from './asset-provider-lists';
import { PettyCash, type CashMovement } from './petty-cash';

export default async function MantenimientoPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'mantenimientos')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Mantenimientos de Áreas Comunes</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;

  const [assets, categories, providers, cash, condo] = await Promise.all([
    listAssets(session!.user.companyId, condoId),
    listAssetCategories(session!.user.companyId, condoId),
    listProviders(session!.user.companyId, condoId),
    getPettyCash(session!.user.companyId, condoId),
    getCondominium(session!.user.companyId, condoId),
  ]);
  // Solo la administración define de cuánto dispone el supervisor.
  const canAllocate = session!.user.role === 'admin_owner';

  return (
    <div>
      <PageHeader
        title="Mantenimientos de Áreas Comunes"
        menu={<ModuleActions module="/app/mantenimiento" condominiumId={condoId} />}
        subtitle="Activos, proveedores y control de la caja chica operativa"
      />
      <CondoSelect condos={condos} selected={condoId} />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div id="activos" className="card scroll-mt-24 p-4 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Activos ({assets.length})</p>
            <div className="flex items-center gap-2">
              <a href={`/app/activos?condoId=${condoId}`} className="text-[.7rem] font-semibold text-royal hover:underline">
                Ficha completa y depreciación →
              </a>
              <QuickAddAsset condominiumId={condoId} categories={categories} />
            </div>
          </div>
          <AssetList
            condominiumId={condoId}
            categories={categories}
            assets={assets.map((a) => ({
              id: a.id,
              code: a.code,
              name: a.name,
              category: a.category ? { id: a.category.id, name: a.category.name } : null,
              description: a.description,
              acquisitionValue: a.acquisitionValue?.toString() ?? null,
              location: a.location,
              photoUrl: a.photoUrl,
            }))}
          />
        </div>
        <div id="proveedores" className="card scroll-mt-24 p-4 transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Proveedores ({providers.length})</p>
            <QuickAddProvider condominiumId={condoId} />
          </div>
          <ProviderList
            providers={providers.map((p) => ({
              id: p.id,
              name: p.name,
              serviceType: p.serviceType,
              phone: p.phone,
              email: p.email,
            }))}
          />
        </div>
      </div>

      <div id="caja-chica" className="mt-6 scroll-mt-24 transition-all">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Caja chica</p>
        <PettyCash
          condominiumId={condoId}
          currency={condo?.currency ?? 'CRC'}
          assigned={cash.summary.assigned}
          spent={cash.summary.spent}
          balance={cash.summary.balance}
          canAllocate={canAllocate}
          allocations={cash.allocations.map(
            (a): CashMovement => ({
              id: a.id,
              date: a.allocatedOn.toISOString(),
              detail: a.note ?? '',
              amount: Number(a.amount),
              author: a.createdBy?.fullName ?? null,
              voidedAt: a.voidedAt ? a.voidedAt.toISOString() : null,
              voidReason: a.voidReason,
            })
          )}
          expenses={cash.expenses.map(
            (e): CashMovement => ({
              id: e.id,
              date: e.spentOn.toISOString(),
              detail: e.detail,
              amount: Number(e.amount),
              author: e.createdBy?.fullName ?? null,
              invoiceUrl: e.invoiceUrl,
              invoiceName: e.invoiceName,
              voidedAt: e.voidedAt ? e.voidedAt.toISOString() : null,
              voidReason: e.voidReason,
            })
          )}
        />
      </div>

    </div>
  );
}
