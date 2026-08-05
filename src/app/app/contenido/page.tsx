import { PlayCircle, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listContentAdmin } from '@/lib/services/content';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { videoThumbnail } from '@/lib/video';

const CATEGORY_LABEL: Record<string, string> = {
  video: 'Video', manual: 'Manual', reglamento: 'Reglamento', curso: 'Curso',
  consejo: 'Consejo', emergencia: 'Emergencia', reciclaje: 'Reciclaje', seguridad: 'Seguridad',
};

/**
 * Vista de SOLO LECTURA. La creación, publicación y borrado del
 * Contenido de Valor viven exclusivamente en el panel master
 * (/master/contenido) — ni la administración ni la supervisión lo
 * modifican.
 */
export default async function ContenidoAdminPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;

  const items = await listContentAdmin(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader title="Contenido de Valor" subtitle="Videos, manuales, reglamentos y consejos para tus residentes" />
      <CondoSelect condos={condos} selected={condoId} />

      <p className="mt-3 flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
        <Lock size={13} className="flex-none" />
        Este contenido lo administra ANEXYpro de forma centralizada. Si necesitas publicar o retirar un material,
        solicítalo al administrador de la plataforma.
      </p>

      <div className="card mt-4 divide-y divide-line">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <PlayCircle className="mx-auto mb-2 text-muted" size={22} />
            Sin contenido todavía.
          </div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
              {i.videoUrl &&
                (videoThumbnail(i.videoUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={videoThumbnail(i.videoUrl)!} alt={i.title} className="h-12 w-20 flex-none rounded-lg object-cover" />
                ) : (
                  <span className="flex h-12 w-20 flex-none items-center justify-center rounded-lg bg-canvas">
                    <PlayCircle className="text-muted" size={18} />
                  </span>
                ))}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{i.title}</p>
                <p className="text-xs text-muted">{CATEGORY_LABEL[i.category]}</p>
              </div>
              <StatusChip variant={i.publishedAt ? 'ok' : 'neutral'}>{i.publishedAt ? 'Publicado' : 'Borrador'}</StatusChip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
