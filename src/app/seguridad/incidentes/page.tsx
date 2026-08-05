import { AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiums } from '@/lib/services/condominiums';
import { listIncidents } from '@/lib/services/security';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SecurityCondoSelect } from '../condo-select';
import { NewIncidentForm } from '../forms';
import { IncidentStatusSelect } from './incident-status-select';

const STATUS_LABEL: Record<string, string> = { abierto: 'Abierto', en_seguimiento: 'En seguimiento', cerrado: 'Cerrado' };
const STATUS_VARIANT: Record<string, 'danger' | 'warn' | 'ok'> = { abierto: 'danger', en_seguimiento: 'warn', cerrado: 'ok' };

export default async function SecurityIncidentsPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiums(session!.user.companyId);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const incidents = await listIncidents(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader title="Incidentes" subtitle="Reporte y seguimiento" />
      <SecurityCondoSelect condos={condos} selected={condoId} />

      <div className="mt-5">
        <NewIncidentForm condominiumId={condoId} />
      </div>

      <div className="card mt-5 divide-y divide-line">
        {incidents.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <AlertTriangle className="mx-auto mb-2 text-muted" size={22} />
            Sin incidentes registrados.
          </div>
        ) : (
          incidents.map((i) => (
            <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{i.title}</p>
                <p className="text-xs text-muted">
                  {i.category}
                  {i.description && ` · ${i.description}`}
                </p>
              </div>
              <StatusChip variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</StatusChip>
              {i.status !== 'cerrado' && <IncidentStatusSelect incidentId={i.id} status={i.status} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
