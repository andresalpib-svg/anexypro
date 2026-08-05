import { PlayCircle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { VideoPlayer } from '@/components/ui/video-player';

const CATEGORY_LABEL: Record<string, string> = {
  video: 'Video', manual: 'Manual', reglamento: 'Reglamento', curso: 'Curso',
  consejo: 'Consejo', emergencia: 'Emergencia', reciclaje: 'Reciclaje', seguridad: 'Seguridad',
};

export default async function ResidentContentPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const items = await withTenantContext(session!.user.companyId, (tx) =>
    tx.contentItem.findMany(  {
      where: { condominiumId: ctx.condominium.id, publishedAt: { not: null } },
      orderBy: { publishedAt: 'desc' },
    })
  );

  return (
    <div>
      <PageHeader title="Contenido de Valor" subtitle="Videos, manuales, reglamentos y consejos de tu condominio" />
      <div className="card divide-y divide-line">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <PlayCircle className="mx-auto mb-2 text-muted" size={22} />
            Sin contenido publicado todavía.
          </div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="p-4 text-sm">
              <p className="font-medium text-ink">
                {i.title} <span className="chip bg-royal-soft text-royal ml-1">{CATEGORY_LABEL[i.category]}</span>
              </p>
              {i.description && <p className="mt-1 text-muted">{i.description}</p>}
              {i.videoUrl && (
                <div className="mt-3">
                  <VideoPlayer url={i.videoUrl} title={i.title} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
