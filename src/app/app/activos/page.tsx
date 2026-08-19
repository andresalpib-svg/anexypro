import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listAssets, listAssetCategories } from '@/lib/services/maintenance';
import { listAssetBookValues } from '@/lib/services/asset-depreciation';
import { listSuppliers } from '@/lib/services/expenses';
import { round2 } from '@/lib/domain/late-interest';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { AssetsBoard, type AssetRow, type SupplierOpt } from './assets-board';

export default async function ActivosPage({ searchParams }: { searchParams: { condoId?: string } }) {
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

  const [assets, categories, bookValues, suppliers] = await Promise.all([
    listAssets(session!.user.companyId, condoId),
    listAssetCategories(session!.user.companyId, condoId),
    listAssetBookValues(session!.user.companyId, condoId),
    listSuppliers(session!.user.companyId),
  ]);

  const rows: AssetRow[] = assets.map((a) => {
    const accumulated = round2(bookValues.get(a.id) ?? 0);
    const acquisitionValue = a.acquisitionValue !== null ? Number(a.acquisitionValue) : null;
    const residualValue = Number(a.residualValue ?? 0);
    const bookValue = acquisitionValue !== null ? round2(Math.max(residualValue, acquisitionValue - accumulated)) : null;

    return {
      id: a.id,
      code: a.code,
      name: a.name,
      categoryId: a.categoryId,
      categoryName: a.category?.name ?? null,
      description: a.description,
      location: a.location,
      purchaseDate: a.purchaseDate?.toISOString() ?? null,
      supplierId: a.supplierId,
      supplierName: a.supplier ? (a.supplier.tradeName ?? a.supplier.legalName) : null,
      acquisitionValue,
      residualValue,
      usefulLifeMonths: a.usefulLifeMonths,
      depreciationMethod: a.depreciationMethod,
      depreciationStartDate: a.depreciationStartDate?.toISOString() ?? null,
      status: a.status,
      photoUrl: a.photoUrl,
      bookValue,
      accumulatedDepreciation: accumulated,
      disposed: a.status === 'baja',
    };
  });

  return (
    <div>
      <PageHeader title="Activos y Depreciaciones" subtitle="Ficha completa, depreciación lineal y baja histórica de cada activo" />
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <AssetsBoard
        condominiumId={condoId}
        canManage={['admin_owner', 'admin_staff'].includes(session!.user.role)}
        assets={rows}
        categories={categories}
        suppliers={suppliers.map((s): SupplierOpt => ({ id: s.id, name: s.tradeName ?? s.legalName }))}
      />
    </div>
  );
}
