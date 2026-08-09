import { Mail, History } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listMyCommunications, listEarlierCommunications } from '@/lib/services/communications';
import { PageHeader } from '@/components/ui/page-header';
import { CommAttachments } from '@/components/ui/comm-attachments';
import { markReadAction } from './actions';

const CATEGORY_LABEL: Record<string, string> = {
  aviso: 'Aviso',
  noticia: 'Noticia',
  urgente: 'Urgente',
  mantenimiento: 'Mantenimiento',
  asamblea: 'Asamblea',
  recordatorio_pago: 'Recordatorio de pago',
  suspension: 'Suspensión',
};

export default async function ResidentCommunicationsPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const [recipients, anteriores] = await Promise.all([
    listMyCommunications(session!.user.companyId, ctx.person.id),
    listEarlierCommunications(session!.user.companyId, ctx.person.id, ctx.condominium.id),
  ]);

  return (
    <div>
      <PageHeader title="Comunicados" subtitle="Avisos y circulares de tu administración" />
      <div className="card divide-y divide-line">
        {recipients.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <Mail className="mx-auto mb-2 text-muted" size={22} />
            {anteriores.length > 0
              ? 'No tenés comunicados nuevos — abajo están los que se publicaron antes de tu ingreso.'
              : 'Sin comunicados todavía.'}
          </div>
        ) : (
          recipients.map((r) => (
            <form key={r.id} action={markReadAction.bind(null, r.communicationId)} className="p-4">
              {/* Los adjuntos van a la derecha del texto: el comunicado
                  no crece hacia abajo y se lee todo de un vistazo. */}
              <div className="flex items-start gap-5">
                <button type="submit" className="min-w-0 flex-1 text-left" disabled={!!r.readAt}>
                  <div className="flex items-center gap-2">
                    {!r.readAt && <span className="h-2 w-2 flex-none rounded-full bg-royal" />}
                    <p className={`font-medium ${r.readAt ? 'text-muted' : 'text-ink'}`}>{r.communication.title}</p>
                    <span className="chip bg-royal-soft text-royal ml-auto">{CATEGORY_LABEL[r.communication.category]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{new Date(r.deliveredAt).toLocaleDateString('es-CR')}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.communication.body}</p>
                </button>
                <CommAttachments attachments={r.communication.attachments} layout="side" />
              </div>
            </form>
          ))
        )}
      </div>

      {/*
        Historial: lo que ya se había publicado cuando esta persona
        entró al condominio. Es de solo lectura —sin acuse— para no
        alterar el "entregado a N · leído por M" que la administración
        usa como constancia de haber avisado.
      */}
      {anteriores.length > 0 && (
        <>
          <p className="mb-2 mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
            <History size={14} /> Publicados antes de tu ingreso ({anteriores.length})
          </p>
          <div className="card divide-y divide-line">
            {anteriores.map((c) => (
              <div key={c.id} className="p-4">
                <div className="flex items-start gap-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-muted">{c.title}</p>
                      <span className="chip bg-canvas text-muted ml-auto">{CATEGORY_LABEL[c.category]}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {c.sentAt ? new Date(c.sentAt).toLocaleDateString('es-CR') : '—'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                  </div>
                  <CommAttachments attachments={c.attachments} layout="side" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
