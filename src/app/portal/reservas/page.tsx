import { Waves, FileText } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listAmenities } from '@/lib/services/amenities';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { NewReservationForm } from './new-reservation-form';

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const STATUS_LABEL: Record<string, string> = { pendiente_aprobacion: 'Pendiente', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada' };
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger' | 'neutral'> = { pendiente_aprobacion: 'warn', confirmada: 'ok', rechazada: 'danger', cancelada: 'neutral' };

export default async function ResidentReservationsPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const [amenities, myReservations] = await Promise.all([
    listAmenities(session!.user.companyId, ctx.condominium.id),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.reservation.findMany(  { where: { propertyId: ctx.property.id }, orderBy: { resDate: 'desc' }, include: { amenity: true } })
    ),
  ]);

  return (
    <div>
      <PageHeader title="Reservas" subtitle="Áreas comunes de tu condominio" />

      {amenities.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-4 max-lg:grid-cols-2">
          {amenities.map((a) => (
            <div key={a.id} className="card overflow-hidden">
              {a.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={a.photoUrl} alt={a.name} className="h-28 w-full object-cover" />
              ) : (
                <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-royal/15 to-royal/5">
                  <Waves className="text-royal/50" size={26} />
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-bold text-ink">{a.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {Number(a.reservationCost) > 0
                    ? `Costo ${Number(a.reservationCost).toLocaleString('es-CR')} · comprobante obligatorio`
                    : 'Sin costo'}
                </p>
                {a.schedules.length > 0 && (
                  <p className="mt-1 text-[.68rem] text-muted">
                    {a.schedules.map((s) => `${DAYS_SHORT[s.dayOfWeek]} ${s.opensAt}–${s.closesAt}`).join(' · ')}
                  </p>
                )}
                {a.rulesUrl && (
                  <a href={a.rulesUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-royal hover:underline">
                    <FileText size={11} /> Normativa de uso
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewReservationForm condominiumId={ctx.condominium.id} amenities={amenities.map((a) => ({ id: a.id, name: a.name, reservationCost: a.reservationCost.toString() }))} />

      <div className="card mt-5 divide-y divide-line">
        {myReservations.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">Sin reservas todavía.</p>
        ) : (
          myReservations.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium text-ink">{r.amenity.name}</span>
              <span className="text-muted">
                {new Date(r.resDate).toLocaleDateString('es-CR')} · {r.startsAt}–{r.endsAt}
              </span>
              <StatusChip variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</StatusChip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
