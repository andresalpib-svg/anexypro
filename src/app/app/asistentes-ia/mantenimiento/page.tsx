import { Wrench } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { getRecurringMaintenanceInsights } from '@/lib/services/maintenance';
import { PageHeader } from '@/components/ui/page-header';
import { CondoSelect } from '../../propiedades/condo-select';

export default async function MaintenanceAssistantPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;

  const insights = await getRecurringMaintenanceInsights(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader title="Asistente de Mantenimiento" subtitle="Activos con reparaciones recurrentes — dato real, no una sugerencia genérica" />
      <CondoSelect condos={condos} selected={condoId} />

      <div className="card mt-5 divide-y divide-line">
        {insights.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <Wrench className="mx-auto mb-2 text-muted" size={22} />
            Ningún activo tiene 2 o más tickets correctivos todavía — nada que señalar por ahora.
          </div>
        ) : (
          insights.map((i, idx) => (
            <div key={idx} className="p-4 text-sm">
              <p className="font-medium text-ink">{i.assetName}</p>
              <p className="mt-1 text-muted">
                {i.correctiveCount} tickets correctivos registrados — se recomienda evaluar reemplazo en
                vez de seguir reparando.
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
