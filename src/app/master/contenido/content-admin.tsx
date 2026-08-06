'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PlayCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { NewContentForm } from './new-content-form';
import { togglePublishAction, deleteContentAction } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type MasterCondo = { id: string; name: string; companyName: string };
export type MasterContentItem = {
  id: string;
  title: string;
  category: string;
  thumbnail: string | null;
  published: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  video: 'Video', manual: 'Manual', reglamento: 'Reglamento', curso: 'Curso',
  consejo: 'Consejo', emergencia: 'Emergencia', reciclaje: 'Reciclaje', seguridad: 'Seguridad',
};

export function ContentAdmin({
  condos,
  selectedId,
  items,
}: {
  condos: MasterCondo[];
  selectedId: string;
  items: MasterContentItem[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedId}
          onChange={(e) => router.push(`/master/contenido?condoId=${e.target.value}`)}
          className="field-input w-auto min-w-72"
        >
          {condos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.companyName}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <NewContentForm condominiumId={selectedId} />
      </div>

      <div className="card mt-4 divide-y divide-line">
        {items.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <PlayCircle className="mx-auto mb-2 text-muted" size={22} />
            Este condominio todavía no tiene contenido.
          </div>
        ) : (
          items.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
              {i.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={i.thumbnail} alt={i.title} className="h-12 w-20 flex-none rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-20 flex-none items-center justify-center rounded-lg bg-canvas">
                  <PlayCircle className="text-muted" size={18} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{i.title}</p>
                <p className="text-xs text-muted">{CATEGORY_LABEL[i.category] ?? i.category}</p>
              </div>
              <StatusChip variant={i.published ? 'ok' : 'neutral'}>{i.published ? 'Publicado' : 'Borrador'}</StatusChip>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  enTransicion(startTransition, async () => {
                    const r = await togglePublishAction(i.id, !i.published);
                    if (r.ok) toast.success(i.published ? 'Contenido despublicado.' : 'Contenido publicado.');
                    else toast.error(r.error);
                  })
                }
                className="text-xs font-semibold text-royal hover:underline"
              >
                {i.published ? 'Despublicar' : 'Publicar'}
              </button>
              <button
                type="button"
                disabled={pending}
                title="Eliminar"
                onClick={() => {
                  if (!window.confirm(`¿Eliminar "${i.title}"? Esta acción no se puede deshacer.`)) return;
                  enTransicion(startTransition, async () => {
                    const r = await deleteContentAction(i.id);
                    if (r.ok) toast.success('Contenido eliminado.');
                    else toast.error(r.error);
                  });
                }}
                className="flex-none text-muted transition hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
