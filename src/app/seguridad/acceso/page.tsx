import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiums } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { SecurityCondoSelect } from '../condo-select';
import { AccessSearch } from './access-search';

export default async function AccesoPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiums(session!.user.companyId);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  return (
    <div>
      <PageHeader title="Control de Acceso" subtitle="Consulta de residentes, unidades y vehículos" />
      <SecurityCondoSelect condos={condos} selected={condoId} />
      <div className="mt-5">
        <AccessSearch condominiumId={condoId} />
      </div>
    </div>
  );
}
