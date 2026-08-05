import { Package as PackageIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiums } from '@/lib/services/condominiums';
import { listPackages } from '@/lib/services/security';
import { listPropertiesByCondo } from '@/lib/services/properties';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SecurityCondoSelect } from '../condo-select';
import { NewPackageForm } from '../forms';
import { deliverPackageAction } from '../incidentes/actions';

export default async function SecurityPackagesPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiums(session!.user.companyId);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const [packages, properties] = await Promise.all([
    listPackages(session!.user.companyId, condoId),
    listPropertiesByCondo(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader title="Paquetería" subtitle="Registro y entrega" />
      <SecurityCondoSelect condos={condos} selected={condoId} />

      <div className="mt-5">
        <NewPackageForm condominiumId={condoId} properties={properties.map((p) => ({ id: p.id, code: p.code }))} />
      </div>

      <div className="card mt-5 divide-y divide-line">
        {packages.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <PackageIcon className="mx-auto mb-2 text-muted" size={22} />
            Sin paquetes registrados.
          </div>
        ) : (
          packages.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium text-ink">{p.property.code}</span>
              <span className="text-muted">{p.courier ?? 'Sin transportista'}</span>
              <StatusChip variant={p.status === 'entregado' ? 'ok' : 'warn'}>{p.status === 'entregado' ? 'Entregado' : 'Recibido'}</StatusChip>
              {p.status === 'recibido' && (
                <form action={deliverPackageAction.bind(null, p.id)} className="ml-auto">
                  <button className="text-xs font-semibold text-royal hover:underline">Marcar entregado</button>
                </form>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
