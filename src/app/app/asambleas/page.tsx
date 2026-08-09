import Link from 'next/link';
import { Plus, ClipboardCheck, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listAssemblies } from '@/lib/services/assemblies';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';

const STATUS_LABEL: Record<string, string> = { convocada: 'Convocada', en_curso: 'En curso', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const STATUS_VARIANT: Record<string, 'warn' | 'royal' | 'ok' | 'danger'> = { convocada: 'warn', en_curso: 'royal', cerrada: 'ok', cancelada: 'danger' };

export default async function AsambleasPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'asambleas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Asambleas</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const assemblies = condoId ? await listAssemblies(session!.user.companyId, condoId) : [];

  return (
    <div>
      <PageHeader
        title="Asambleas"
        subtitle="Convocatorias, agenda, votaciones y actas"
        action={
          condoId && (
            <Link href={`/app/asambleas/nuevo?condoId=${condoId}`} className="btn-primary">
              <Plus size={16} /> Nueva convocatoria
            </Link>
          )
        }
      />

      {condos.length === 0 ? (
        <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />
      ) : (
        <>
          <CondoSelect condos={condos} selected={condoId!} />
          <div className="card mt-5 divide-y divide-line">
            {assemblies.length === 0 ? (
              <div className="p-10 text-center text-muted">
                <ClipboardCheck className="mx-auto mb-2 text-muted" size={22} />
                Sin asambleas todavía.
              </div>
            ) : (
              assemblies.map((a) => (
                <Link key={a.id} href={`/app/asambleas/${a.id}`} className="flex items-center gap-3 p-4 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{a.title}</p>
                    <p className="text-xs text-muted">
                      {a.type === 'ordinaria' ? 'Ordinaria' : 'Extraordinaria'} · {fechaSolo(a.eventDate)}
                    </p>
                  </div>
                  <StatusChip variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</StatusChip>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
