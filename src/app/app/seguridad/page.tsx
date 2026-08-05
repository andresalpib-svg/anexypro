import { AlertTriangle, Package as PackageIcon, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listIncidents, listPackages } from '@/lib/services/security';
import { listPropertiesByCondo } from '@/lib/services/properties';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { NewIncidentForm, NewPackageForm } from './forms';
import { IncidentStatusSelect } from './incident-status-select';
import { deliverPackageAction } from './actions';

const INC_STATUS_LABEL: Record<string, string> = { abierto: 'Abierto', en_seguimiento: 'En seguimiento', cerrado: 'Cerrado' };
const INC_STATUS_VARIANT: Record<string, 'danger' | 'warn' | 'ok'> = { abierto: 'danger', en_seguimiento: 'warn', cerrado: 'ok' };

export default async function SeguridadPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'seguridad')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Seguridad</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;

  const [incidents, packages, properties] = await Promise.all([
    listIncidents(session!.user.companyId, condoId),
    listPackages(session!.user.companyId, condoId),
    listPropertiesByCondo(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader title="Seguridad" subtitle="Incidentes y paquetería" />
      <CondoSelect condos={condos} selected={condoId} />

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <AlertTriangle size={14} /> Incidentes ({incidents.length})
        </p>
        <NewIncidentForm condominiumId={condoId} />
        <div className="card mt-3 divide-y divide-line">
          {incidents.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">Sin incidentes registrados.</p>
          ) : (
            incidents.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{i.title}</p>
                  <p className="text-xs text-muted">{i.category}{i.description && ` · ${i.description}`}</p>
                </div>
                <StatusChip variant={INC_STATUS_VARIANT[i.status]}>{INC_STATUS_LABEL[i.status]}</StatusChip>
                {i.status !== 'cerrado' && <IncidentStatusSelect incidentId={i.id} status={i.status} />}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
          <PackageIcon size={14} /> Paquetería ({packages.length})
        </p>
        <NewPackageForm condominiumId={condoId} properties={properties.map((p) => ({ id: p.id, code: p.code }))} />
        <div className="card mt-3 divide-y divide-line">
          {packages.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">Sin paquetes registrados.</p>
          ) : (
            packages.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="font-medium text-ink">{p.property.code}</span>
                <span className="text-muted">{p.courier ?? 'Sin transportista'}</span>
                <StatusChip variant={p.status === 'entregado' ? 'ok' : 'warn'}>
                  {p.status === 'entregado' ? 'Entregado' : 'Recibido'}
                </StatusChip>
                {p.status === 'recibido' && (
                  <form action={deliverPackageAction.bind(null, p.id)} className="ml-auto">
                    <button className="text-xs font-semibold text-royal hover:underline">Marcar entregado</button>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
