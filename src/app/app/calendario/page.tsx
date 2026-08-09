import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listMonthEvents, toMonthEvent } from '@/lib/services/calendar';
import { getTaskBuckets } from '@/lib/services/tasks';
import { PageHeader } from '@/components/ui/page-header';
import { MonthCalendar, SummaryRows } from '@/components/ui/month-calendar';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { NewEventForm } from './new-event-form';

const PRIORITY_LABEL: Record<string, string> = { baja: 'baja', media: 'media', alta: 'ALTA' };

function parseMonth(mes?: string): { year: number; month: number } {
  const m = mes?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthHref(condoId: string, year: number, month: number, delta: number): string {
  const d = new Date(year, month - 1 + delta, 1);
  return `/app/calendario?condoId=${condoId}&mes=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: { condoId?: string; mes?: string };
}) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const { year, month } = parseMonth(searchParams.mes);

  if (!condoId) {
    return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;
  }

  const [events, buckets] = await Promise.all([
    listMonthEvents(session!.user.companyId, condoId, year, month),
    getTaskBuckets(session!.user.companyId),
  ]);

  const taskItem = (t: (typeof buckets.hoy)[number]) => ({
    id: t.id,
    title: t.title,
    sub: [t.assignedTo?.fullName, PRIORITY_LABEL[t.priority]].filter(Boolean).join(' · '),
  });

  return (
    <div>
      <PageHeader
        title="Calendario General"
        subtitle="Vista mensual de eventos — internos y para condóminos"
        action={<NewEventForm condominiumId={condoId} />}
      />
      <div className="mb-3">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <MonthCalendar
        year={year}
        month={month}
        prevHref={monthHref(condoId, year, month, -1)}
        nextHref={monthHref(condoId, year, month, 1)}
        events={events.map(toMonthEvent)}
      />

      <p className="mb-1.5 mt-4 text-[.64rem] font-bold uppercase tracking-wide text-muted">Resumen de tareas del equipo</p>
      <SummaryRows
        rows={[
          { label: 'Tareas de hoy', items: buckets.hoy.map(taskItem) },
          { label: 'Esta semana', items: buckets.semana.map(taskItem) },
          { label: 'Este mes', items: buckets.mes.map(taskItem) },
        ]}
      />
    </div>
  );
}
