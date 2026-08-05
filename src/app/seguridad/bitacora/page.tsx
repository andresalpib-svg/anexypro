import { ListTree, DoorOpen, Package as PackageIcon, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiums } from '@/lib/services/condominiums';
import { getSecurityLog } from '@/lib/services/security';
import { PageHeader } from '@/components/ui/page-header';
import { SecurityCondoSelect } from '../condo-select';

const ICON: Record<string, typeof DoorOpen> = { ingreso: DoorOpen, salida: DoorOpen, paquete: PackageIcon, incidente: AlertTriangle };
const COLOR: Record<string, string> = { ingreso: 'bg-royal-soft text-royal', salida: 'bg-canvas text-muted', paquete: 'bg-warn-bg text-warn', incidente: 'bg-danger-bg text-danger' };
const LABEL: Record<string, string> = { ingreso: 'Ingreso', salida: 'Salida', paquete: 'Paquete', incidente: 'Incidente' };

export default async function BitacoraPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiums(session!.user.companyId);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const log = await getSecurityLog(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader title="Bitácora" subtitle="Ingresos, salidas, paquetería e incidentes en una sola línea de tiempo" />
      <SecurityCondoSelect condos={condos} selected={condoId} />

      <div className="card mt-5 divide-y divide-line">
        {log.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <ListTree className="mx-auto mb-2 text-muted" size={22} />
            Sin actividad registrada.
          </div>
        ) : (
          log.map((e, i) => {
            const Icon = ICON[e.kind] ?? ListTree;
            return (
              <div key={i} className="flex items-center gap-3 p-3 text-sm">
                <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${COLOR[e.kind]}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    {LABEL[e.kind]}: {e.summary}
                  </p>
                  <p className="text-xs text-muted">{new Date(e.occurredAt).toLocaleString('es-CR')}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
