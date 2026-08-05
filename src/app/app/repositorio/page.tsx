import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { actorFromSession, listVisibleFolders, listFolderObjects } from '@/lib/services/storage';
import { getStorageSettings, PROVIDER_LABEL } from '@/lib/storage';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { CondoSelect } from '../propiedades/condo-select';
import { RepositoryBrowser, type FolderRow, type ObjectRow } from './repository-browser';

export default async function RepositorioPage({
  searchParams,
}: {
  searchParams: { condoId?: string; carpeta?: string };
}) {
  const session = await auth();
  const allowed = ['master', 'admin_owner', 'admin_staff', 'contador', 'seguridad'];
  if (!session?.user || !allowed.includes(session.user.role)) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso al repositorio</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero creá un condominio.</div>;

  const [actor, condo, settings] = await Promise.all([
    actorFromSession(session),
    getCondominium(session.user.companyId, condoId),
    getStorageSettings(),
  ]);

  const folders = await listVisibleFolders(actor, condoId);
  const selectedId = folders.find((f) => f.id === searchParams.carpeta)?.id ?? folders[0]?.id ?? null;
  const objects = selectedId ? await listFolderObjects(actor, selectedId) : [];

  return (
    <div>
      <PageHeader
        title="Repositorio de Documentos"
        menu={<ModuleActions module="/app/repositorio" />}
        subtitle="Todo el archivo del condominio, con acceso según tu rol"
      />
      <div className="mb-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <div id="reconstruir-arbol" className="scroll-mt-24 transition-all">
      <RepositoryBrowser
        condominiumId={condoId}
        condoName={condo?.name ?? 'Condominio'}
        providerLabel={PROVIDER_LABEL[settings.provider]}
        canRebuild={['master', 'admin_owner'].includes(session.user.role)}
        selectedId={selectedId}
        folders={folders as FolderRow[]}
        objects={objects.map(
          (o): ObjectRow => ({
            id: o.id,
            name: o.name,
            mimeType: o.mimeType,
            sizeBytes: o.sizeBytes,
            sha256: o.sha256,
            createdAt: o.createdAt.toISOString(),
            ownerName: o.ownerName,
          })
        )}
        />
      </div>
    </div>
  );
}
