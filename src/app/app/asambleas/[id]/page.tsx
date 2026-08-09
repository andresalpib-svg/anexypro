import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getAssembly } from '@/lib/services/assemblies';
import { canAccessCondo } from '@/lib/services/condominiums';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { VoteControls, MinutesForm } from './vote-controls';

export default async function AssemblyDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const assembly = await getAssembly(session!.user.companyId, params.id);
  if (!assembly) notFound();
  // Solo condominios asignados: la URL directa no salta la asignación.
  if (!(await canAccessCondo(session!, assembly.condominiumId))) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={assembly.title}
        subtitle={`${fechaSolo(assembly.eventDate)} · ${assembly.eventTime}${assembly.location ? ' · ' + assembly.location : ''}`}
        action={
          <Link href="/app/asambleas" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="card mb-4 flex items-start gap-3 p-4 text-sm">
        <Lock size={16} className="mt-0.5 flex-none text-muted" />
        <p className="text-muted">
          <b className="text-ink">Solo lectura para la administración.</b> Cada residente vota únicamente
          desde su propia cuenta — la administración puede abrir/cerrar la votación y ver resultados en
          tiempo real, pero nunca puede emitir ni modificar un voto.
        </p>
      </div>

      <div className="card mb-4 p-5 text-sm text-ink">{assembly.convocatoriaBody}</div>

      <div className="space-y-4">
        {assembly.topics.map((topic) => {
          const ballots = topic.vote?.ballots ?? [];
          const aFavor = ballots.filter((b) => b.choice === 'a_favor').length;
          const enContra = ballots.filter((b) => b.choice === 'en_contra').length;
          const abstencion = ballots.filter((b) => b.choice === 'abstencion').length;
          const total = ballots.length;
          return (
            <div key={topic.id} className="card p-5">
              <div className="mb-3 flex items-center gap-2">
                <p className="font-semibold text-ink">{topic.title}</p>
                <StatusChip variant={!topic.vote ? 'neutral' : topic.vote.status === 'abierta' ? 'warn' : 'ok'}>
                  {!topic.vote ? 'Sin abrir' : topic.vote.status === 'abierta' ? 'Abierta' : 'Cerrada'}
                </StatusChip>
                <VoteControls topicId={topic.id} assemblyId={assembly.id} voteStatus={topic.vote?.status ?? null} />
              </div>
              {total > 0 ? (
                <div className="space-y-1.5 text-sm">
                  <Bar label="A favor" value={aFavor} total={total} color="bg-ok" />
                  <Bar label="En contra" value={enContra} total={total} color="bg-danger" />
                  <Bar label="Abstención" value={abstencion} total={total} color="bg-muted" />
                  <p className="mt-1 text-xs text-muted">{total} voto(s) en total</p>
                </div>
              ) : (
                <p className="text-sm text-muted">Sin votos todavía.</p>
              )}
            </div>
          );
        })}
      </div>

      {assembly.status !== 'cerrada' && !assembly.minutesPublished && (
        <div className="card mt-4 p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Publicar acta</p>
          <MinutesForm assemblyId={assembly.id} />
        </div>
      )}
      {assembly.minutesPublished && (
        <div className="card mt-4 p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Acta publicada</p>
          <p className="whitespace-pre-wrap text-sm text-ink">{assembly.minutesBody}</p>
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>
          {value} ({pct}%)
        </span>
      </div>
      <div className="mt-0.5 h-2 rounded-full bg-canvas">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
