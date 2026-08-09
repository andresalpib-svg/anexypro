import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getEvent } from '@/lib/services/calendar';
import { getResidentContext } from '@/lib/services/resident-context';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';

const TYPE_LABEL: Record<string, string> = {
  mantenimiento: 'Mantenimiento',
  asamblea: 'Asamblea',
  reserva: 'Reserva',
  corte_servicio: 'Corte de servicio',
  actividad: 'Actividad',
  otro: 'Otro',
};
const TYPE_VARIANT: Record<string, 'warn' | 'royal' | 'danger' | 'ok' | 'neutral'> = {
  mantenimiento: 'warn',
  asamblea: 'royal',
  reserva: 'royal',
  corte_servicio: 'danger',
  actividad: 'ok',
  otro: 'neutral',
};

/** Detalle del evento — se abre con un clic desde cualquier calendario. */
export default async function EventoPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const isResident = session.user.role === 'condomino';
  // El residente solo ve eventos dirigidos a condóminos, y solo de su
  // propio condominio.
  const event = await getEvent(session.user.companyId, params.id, isResident ? 'condominos' : undefined);
  if (!event) notFound();

  if (isResident) {
    const ctx = await getResidentContext(session.user.id);
    if (!ctx || ctx.condominium.id !== event.condominiumId) notFound();
  }

  const back = isResident ? '/portal/calendario' : '/app/calendario';

  return (
    <div className="mx-auto max-w-2xl p-6">
      <PageHeader
        title={event.title}
        subtitle={event.condominium.name}
        action={
          <Link href={back} className="btn-ghost">
            <ArrowLeft size={16} /> Volver al calendario
          </Link>
        }
      />

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip variant={TYPE_VARIANT[event.eventType]}>{TYPE_LABEL[event.eventType]}</StatusChip>
          {event.audience === 'interna' && (
            <span className="chip bg-canvas text-muted">
              <Users size={12} /> Evento interno de la administración
            </span>
          )}
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="flex-none text-royal" />
            <span className="text-ink">
              {fechaSolo(event.eventDate, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          {event.eventTime && (
            <div className="flex items-center gap-2.5">
              <Clock size={16} className="flex-none text-royal" />
              <span className="text-ink">{event.eventTime}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2.5">
              <MapPin size={16} className="flex-none text-royal" />
              <span className="text-ink">{event.location}</span>
            </div>
          )}
        </dl>

        {event.description ? (
          <p className="mt-5 whitespace-pre-wrap border-t border-line pt-5 text-sm leading-relaxed text-ink">
            {event.description}
          </p>
        ) : (
          <p className="mt-5 border-t border-line pt-5 text-sm text-muted">
            La administración no agregó detalles adicionales para este evento.
          </p>
        )}
      </div>
    </div>
  );
}
