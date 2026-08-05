import { withTenantContext } from '@/lib/db';

export async function listUpcomingEvents(companyId: string, condominiumId: string, audience?: 'condominos') {
  return withTenantContext(companyId, (tx) =>
    tx.calendarEvent.findMany({
      where: {
        condominiumId,
        eventDate: { gte: new Date(new Date().toDateString()) },
        ...(audience ? { audience } : {}),
      },
      orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
    })
  );
}

/** Eventos de un mes calendario (year 4 dígitos, month 1-12). */
export async function listMonthEvents(companyId: string, condominiumId: string, year: number, month: number, audience?: 'condominos') {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return withTenantContext(companyId, (tx) =>
    tx.calendarEvent.findMany({
      where: { condominiumId, eventDate: { gte: from, lt: to }, ...(audience ? { audience } : {}) },
      orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
    })
  );
}

type EventLike = {
  id: string;
  title: string;
  eventDate: Date;
  eventTime: string | null;
  eventType: string;
  audience: string;
  description: string | null;
  location: string | null;
};

/** Traduce un evento de la BD al formato que consume `MonthCalendar`. */
export function toMonthEvent(e: EventLike) {
  return {
    // El campo es `@db.Date` (medianoche UTC): el día se lee del ISO, no con
    // getDate(), que lo correría un día en zonas al oeste de Greenwich.
    id: e.id,
    day: Number(e.eventDate.toISOString().slice(8, 10)),
    title: e.title,
    eventTime: e.eventTime,
    eventType: e.eventType,
    audience: e.audience,
    description: e.description,
    location: e.location,
    eventDate: e.eventDate.toISOString(),
  };
}

/** Reparte los eventos del mes en hoy / resto de la semana / resto del mes. */
export function bucketEvents<T extends EventLike>(events: T[]) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const dstr = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const todayStr = dstr(now);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + (6 - now.getDay()));

  const buckets = { hoy: [] as T[], semana: [] as T[], mes: [] as T[] };
  for (const e of events) {
    const day = e.eventDate.toISOString().slice(0, 10);
    if (day < todayStr) continue; // lo que ya pasó no se resume
    if (day === todayStr) buckets.hoy.push(e);
    else if (day <= dstr(weekEnd)) buckets.semana.push(e);
    else buckets.mes.push(e);
  }
  return buckets;
}

/** Línea secundaria del resumen: "23 jul 10:00". */
export function eventSummaryItem(e: EventLike) {
  return {
    id: e.id,
    title: e.title,
    sub: `${new Date(e.eventDate).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}${
      e.eventTime ? ` ${e.eventTime}` : ''
    }`,
  };
}

export async function createCalendarEvent(
  companyId: string,
  userId: string,
  input: { condominiumId: string; title: string; eventType: string; eventDate: Date; eventTime?: string; audience?: string; description?: string; location?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.calendarEvent.create({
      data: {
        condominiumId: input.condominiumId,
        title: input.title,
        eventType: input.eventType as any,
        eventDate: input.eventDate,
        eventTime: input.eventTime || null,
        description: input.description || null,
        location: input.location || null,
        audience: input.audience === 'interna' ? 'interna' : 'condominos',
        source: 'manual',
        createdById: userId,
      },
    })
  );
}

/** Un evento por id — para la pantalla de detalle. */
export async function getEvent(companyId: string, id: string, audience?: 'condominos') {
  return withTenantContext(companyId, (tx) =>
    tx.calendarEvent.findFirst({
      where: { id, ...(audience ? { audience } : {}) },
      include: { condominium: { select: { name: true } } },
    })
  );
}
