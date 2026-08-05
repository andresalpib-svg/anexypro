import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listMonthEvents, toMonthEvent, bucketEvents, eventSummaryItem } from '@/lib/services/calendar';
import { PageHeader } from '@/components/ui/page-header';
import { MonthCalendar, SummaryRows } from '@/components/ui/month-calendar';

function parseMonth(mes?: string): { year: number; month: number } {
  const m = mes?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthHref(year: number, month: number, delta: number): string {
  const d = new Date(year, month - 1 + delta, 1);
  return `/portal/calendario?mes=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default async function ResidentCalendarPage({ searchParams }: { searchParams: { mes?: string } }) {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const { year, month } = parseMonth(searchParams.mes);
  // Solo eventos dirigidos a condóminos: los internos de la administración
  // nunca llegan a este portal.
  const events = await listMonthEvents(session!.user.companyId, ctx.condominium.id, year, month, 'condominos');
  const buckets = bucketEvents(events);

  return (
    <div>
      <PageHeader title="Calendario" subtitle={`Eventos de ${ctx.condominium.name} — haz clic en un evento para ver el detalle`} />

      <MonthCalendar
        year={year}
        month={month}
        prevHref={monthHref(year, month, -1)}
        nextHref={monthHref(year, month, 1)}
        events={events.map(toMonthEvent)}
      />

      <SummaryRows
        rows={[
          { label: 'Hoy', items: buckets.hoy.map(eventSummaryItem) },
          { label: 'Esta semana', items: buckets.semana.map(eventSummaryItem) },
          { label: 'Este mes', items: buckets.mes.map(eventSummaryItem) },
        ]}
      />
    </div>
  );
}
