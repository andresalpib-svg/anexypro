import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getCommunication } from '@/lib/services/communications';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CommAttachments } from '@/components/ui/comm-attachments';
import { audienceLabel } from '@/lib/comm-audience';
import { publishCommunicationAction } from '../actions';

const STATUS_LABEL: Record<string, string> = { borrador: 'Borrador', programado: 'Programado', enviado: 'Enviado' };

export default async function ComunicadoDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const comm = await getCommunication(session!.user.companyId, params.id);
  if (!comm) notFound();

  async function handlePublish() {
    'use server';
    await publishCommunicationAction(params.id);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={comm.title}
        subtitle={comm.sentAt ? `Enviado el ${new Date(comm.sentAt).toLocaleDateString('es-CR')}` : 'Sin enviar'}
        action={
          <Link href="/app/comunicados" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <StatusChip variant={comm.status === 'enviado' ? 'ok' : 'neutral'}>{STATUS_LABEL[comm.status]}</StatusChip>
        {comm.status === 'borrador' && (
          <form action={handlePublish}>
            <button type="submit" className="btn-primary py-1.5 text-xs">
              <Send size={13} /> Publicar ahora
            </button>
          </form>
        )}
      </div>

      <div className="card p-6">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{comm.body}</p>
        <CommAttachments attachments={comm.attachments} />
      </div>

      <div className="card mt-4 p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          {comm.status === 'enviado' ? 'Alcance' : 'Audiencia'}
        </p>
        <p className="text-sm text-ink">
          {comm.status === 'enviado' ? 'Enviado a' : 'Se enviará a'}: <b>{audienceLabel(comm.targets)}</b>
        </p>
        {comm.status === 'enviado' && (
          <p className="mt-1 text-sm text-ink">
            Entregado a <b>{comm.stats.total}</b> residente(s) · leído por <b>{comm.stats.reads}</b> (
            {comm.stats.total ? Math.round((comm.stats.reads / comm.stats.total) * 100) : 0}%)
          </p>
        )}
      </div>
    </div>
  );
}
