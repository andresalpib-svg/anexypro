import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getAssembly } from '@/lib/services/assemblies';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { BallotForm } from './ballot-form';

export default async function ResidentAssemblyDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const assembly = await getAssembly(session!.user.companyId, params.id);
  if (!assembly || assembly.condominiumId !== ctx.condominium.id) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={assembly.title}
        subtitle={`${fechaSolo(assembly.eventDate)} · ${assembly.eventTime}${assembly.location ? ' · ' + assembly.location : ''}`}
        action={
          <Link href="/portal/asambleas" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="card mb-4 p-6 text-sm text-ink">{assembly.convocatoriaBody}</div>

      <div className="space-y-4">
        {assembly.topics.map((topic) => {
          const ballots = topic.vote?.ballots ?? [];
          const myBallot = ballots.find((b) => b.propertyId === ctx.property.id);
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
              </div>

              {topic.vote?.status === 'abierta' && !myBallot && <BallotForm voteId={topic.vote.id} assemblyId={assembly.id} />}
              {myBallot && <p className="mb-2 text-sm text-muted">Ya votaste: <b className="text-ink">{myBallot.choice.replace('_', ' ')}</b></p>}
              {!topic.vote && <p className="text-sm text-muted">La administración todavía no ha abierto esta votación.</p>}

              {total > 0 && (
                <div className="mt-3 space-y-1.5 text-sm">
                  <Bar label="A favor" value={aFavor} total={total} color="bg-ok" />
                  <Bar label="En contra" value={enContra} total={total} color="bg-danger" />
                  <Bar label="Abstención" value={abstencion} total={total} color="bg-muted" />
                  <p className="mt-1 text-xs text-muted">{total} voto(s) en total</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
