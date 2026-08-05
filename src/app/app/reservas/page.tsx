import { Waves } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listAmenities } from '@/lib/services/amenities';
import { listReservations } from '@/lib/services/reservations';
import { listPropertiesByCondo } from '@/lib/services/properties';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { NewAmenityForm } from './new-amenity-form';
import { NewReservationForm } from './new-reservation-form';
import { AmenityCards } from './amenity-cards';
import { DecideButtons } from './decide-buttons';

const STATUS_LABEL: Record<string, string> = {
  pendiente_aprobacion: 'Pendiente',
  confirmada: 'Confirmada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  pendiente_aprobacion: 'warn',
  confirmada: 'ok',
  rechazada: 'danger',
  cancelada: 'neutral',
};

export default async function ReservasPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);

  if (!condoId) {
    return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;
  }

  const [amenities, reservations, properties] = await Promise.all([
    listAmenities(session!.user.companyId, condoId),
    listReservations(session!.user.companyId, condoId),
    listPropertiesByCondo(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader
        title="Reservas"
        subtitle="Áreas comunes y su calendario de disponibilidad"
        menu={<ModuleActions module="/app/reservas" />}
      />
      <CondoSelect condos={condos} selected={condoId} />

      <div id="areas-comunes" className="card mt-5 scroll-mt-24 p-5 transition-all">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Áreas comunes ({amenities.length})</p>
          <NewAmenityForm condominiumId={condoId} />
        </div>
        <AmenityCards
          amenities={amenities.map((a) => ({
            id: a.id,
            name: a.name,
            capacity: a.capacity,
            reservationCost: a.reservationCost.toString(),
            requiresApproval: a.requiresApproval,
            rulesUrl: a.rulesUrl,
            photoUrl: a.photoUrl,
            exclusivePerDay: a.exclusivePerDay,
            maxHours: a.maxHours,
            advanceDays: a.advanceDays,
            status: a.status,
            schedules: a.schedules.map((s) => ({ id: s.id, dayOfWeek: s.dayOfWeek, opensAt: s.opensAt, closesAt: s.closesAt })),
          }))}
        />
      </div>

      <div className="mt-5">
        <NewReservationForm
          condominiumId={condoId}
          amenities={amenities.map((a) => ({ id: a.id, name: a.name }))}
          properties={properties.map((p) => ({ id: p.id, code: p.code }))}
        />
      </div>

      <div className="card mt-5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Área</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Horario</th>
              <th className="px-4 py-3">Comprobante</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {reservations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Sin reservas todavía.
                </td>
              </tr>
            ) : (
              reservations.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{r.amenity.name}</td>
                  <td className="px-4 py-3 text-muted">{r.property.code}</td>
                  <td className="px-4 py-3 text-muted">{new Date(r.resDate).toLocaleDateString('es-CR')}</td>
                  <td className="px-4 py-3 text-muted">
                    {r.startsAt}–{r.endsAt}
                  </td>
                  <td className="px-4 py-3">
                    {r.receiptUrl ? (
                      <a
                        href={r.receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-royal hover:underline"
                      >
                        Ver comprobante
                      </a>
                    ) : Number(r.cost) > 0 ? (
                      <span className="text-xs text-warn">Pendiente</span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</StatusChip>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'pendiente_aprobacion' && <DecideButtons reservationId={r.id} />}
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
