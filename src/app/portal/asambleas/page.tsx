import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listAssemblies } from '@/lib/services/assemblies';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';

const STATUS_LABEL: Record<string, string> = { convocada: 'Convocada', en_curso: 'En curso', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const STATUS_VARIANT: Record<string, 'warn' | 'royal' | 'ok' | 'danger'> = { convocada: 'warn', en_curso: 'royal', cerrada: 'ok', cancelada: 'danger' };

export default async function ResidentAssembliesPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const assemblies = await listAssemblies(session!.user.companyId, ctx.condominium.id);

  return (
    <div>
      <PageHeader title="Asambleas" subtitle="Convocatorias, agenda, votaciones y actas" />
      <div className="card divide-y divide-line">
        {assemblies.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <ClipboardCheck className="mx-auto mb-2 text-muted" size={22} />
            Sin asambleas todavía.
          </div>
        ) : (
          assemblies.map((a) => (
            <Link key={a.id} href={`/portal/asambleas/${a.id}`} className="flex items-center gap-3 p-4 hover:bg-canvas">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{a.title}</p>
                <p className="text-xs text-muted">
                  {a.type === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'} · {new Date(a.eventDate).toLocaleDateString('es-CR')}
                </p>
              </div>
              <StatusChip variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</StatusChip>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
