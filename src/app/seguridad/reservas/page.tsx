import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listReservations } from '@/lib/services/reservations';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SecurityCondoSelect } from '../condo-select';

const STATUS_LABEL: Record<string, string> = { pendiente_aprobacion: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger' | 'neutral'> = { pendiente_aprobacion: 'warn', confirmada: 'ok', rechazada: 'danger', cancelada: 'neutral' };

export default async function SecurityReservationsPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const reservations = await listReservations(session!.user.companyId, condoId);
  const today = new Date().toDateString();
  const todayReservations = reservations.filter((r) => new Date(r.resDate).toDateString() === today);

  return (
    <div>
      <PageHeader title="Reservas" subtitle="Consulta — quién tiene reservada cada área hoy" />
      <SecurityCondoSelect condos={condos} selected={condoId} />

      <div className="card mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Área</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Horario</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {todayReservations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  Sin reservas para hoy.
                </td>
              </tr>
            ) : (
              todayReservations.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.amenity.name}</td>
                  <td className="px-4 py-3 text-muted">{r.property.code}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.startsAt}–{r.endsAt}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</StatusChip>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
