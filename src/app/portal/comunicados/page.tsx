import { Mail } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listMyCommunications } from '@/lib/services/communications';
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

  const recipients = await listMyCommunications(session!.user.companyId, ctx.person.id);

  return (
    <div>
      <PageHeader title="Comunicados" subtitle="Avisos y circulares de tu administración" />
      <div className="card divide-y divide-line">
        {recipients.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <Mail className="mx-auto mb-2 text-muted" size={22} />
            Sin comunicados todavía.
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
    </div>
  );
}
