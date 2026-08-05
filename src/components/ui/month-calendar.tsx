'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, X, CalendarDays, Clock, MapPin, Users } from 'lucide-react';

export type MonthEvent = {
  id: string;
  day: number; // día del mes (1-31)
  title: string;
  eventTime: string | null;
  eventType: string;
  audience: string;
  description?: string | null;
  location?: string | null;
  eventDate?: string | null; // ISO, para el detalle
};

const TYPE_LABEL: Record<string, string> = {
  mantenimiento: 'Mantenimiento',
  asamblea: 'Asamblea',
  reserva: 'Reserva',
  corte_servicio: 'Corte de servicio',
  actividad: 'Actividad',
  otro: 'Otro',
};

const TYPE_DOT: Record<string, string> = {
  mantenimiento: 'bg-warn',
  asamblea: 'bg-royal',
  reserva: 'bg-lumen',
  corte_servicio: 'bg-danger',
  actividad: 'bg-ok',
  otro: 'bg-muted',
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Grilla mensual. Al hacer clic en un evento, su detalle completo
 * se sobrepone al calendario SIN salir del módulo.
 */
export function MonthCalendar({
  year,
  month, // 1-12
  events,
  prevHref,
  nextHref,
}: {
  year: number;
  month: number;
  events: MonthEvent[];
  prevHref: string;
  nextHref: string;
}) {
  const [selected, setSelected] = useState<MonthEvent | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // El detalle se sobrepone dentro de la tarjeta, así que el clic "fuera" hay
  // que escucharlo en todo el documento: si solo se escuchara en la capa del
  // overlay, un clic en el resto de la página lo dejaría abierto.
  useEffect(() => {
    if (!selected) return;
    const onDown = (ev: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(ev.target as Node)) setSelected(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSelected(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [selected]);

  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = first.getDay(); // 0 = domingo
  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month - 1 && today.getDate() === d;

  const byDay = new Map<number, MonthEvent[]>();
  for (const e of events) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <Link href={prevHref} className="btn-ghost px-2 py-1" aria-label="Mes anterior">
          <ChevronLeft size={16} />
        </Link>
        <p className="font-sans text-sm font-bold text-ink">
          {MONTHS[month - 1]} {year}
        </p>
        <Link href={nextHref} className="btn-ghost px-2 py-1" aria-label="Mes siguiente">
          <ChevronRight size={16} />
        </Link>
      </div>
      <div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-[.6rem] font-bold uppercase tracking-wide text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`min-h-[52px] border-b border-r border-line p-1 [&:nth-child(7n)]:border-r-0 ${
              day === null ? 'bg-canvas/50' : ''
            }`}
          >
            {day !== null && (
              <>
                <p
                  className={`mb-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[.68rem] font-semibold ${
                    isToday(day) ? 'bg-royal text-white' : 'text-ink'
                  }`}
                >
                  {day}
                </p>
                <div className="space-y-0.5">
                  {(byDay.get(day) ?? []).slice(0, 2).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e)}
                      title={`${e.title}${e.eventTime ? ` · ${e.eventTime}` : ''}${e.audience === 'interna' ? ' · interno' : ''}`}
                      className="flex w-full items-center gap-1 truncate rounded bg-canvas px-1 py-px text-left text-[.6rem] font-medium leading-tight text-ink transition hover:bg-royal-soft hover:text-royal"
                    >
                      <span className={`h-1.5 w-1.5 flex-none rounded-full ${TYPE_DOT[e.eventType] ?? 'bg-muted'}`} />
                      <span className="truncate">
                        {e.title}
                        {e.audience === 'interna' && <span className="text-muted"> · interno</span>}
                      </span>
                    </button>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 2 && (
                    <p className="px-1 text-[.58rem] font-semibold text-muted">+{byDay.get(day)!.length - 2} más</p>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Detalle del evento sobrepuesto al calendario, en el mismo módulo */}
      {selected && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-deep/50 p-4 backdrop-blur-sm">
          <div ref={boxRef} className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
            <header className="flex items-start gap-3 border-b border-line px-5 py-3">
              <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${TYPE_DOT[selected.eventType] ?? 'bg-muted'}`} />
              <div className="min-w-0 flex-1">
                <p className="font-sans text-base font-bold text-ink">{selected.title}</p>
                <p className="text-xs text-muted">
                  {TYPE_LABEL[selected.eventType] ?? selected.eventType}
                  {selected.audience === 'interna' && ' · interno de la administración'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Cerrar detalle"
                className="flex-none rounded-lg p-1 text-muted transition hover:bg-canvas hover:text-ink"
              >
                <X size={16} />
              </button>
            </header>

            <div className="space-y-2.5 px-5 py-4 text-sm">
              <p className="flex items-center gap-2 text-ink">
                <CalendarDays size={15} className="flex-none text-royal" />
                {selected.eventDate
                  ? new Date(selected.eventDate).toLocaleDateString('es-CR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })
                  : `${selected.day} de ${MONTHS[month - 1]} de ${year}`}
              </p>
              {selected.eventTime && (
                <p className="flex items-center gap-2 text-ink">
                  <Clock size={15} className="flex-none text-royal" /> {selected.eventTime}
                </p>
              )}
              {selected.location && (
                <p className="flex items-center gap-2 text-ink">
                  <MapPin size={15} className="flex-none text-royal" /> {selected.location}
                </p>
              )}
              {selected.audience === 'interna' && (
                <p className="flex items-center gap-2 text-muted">
                  <Users size={15} className="flex-none" /> Solo visible para la administración
                </p>
              )}
              <p className="whitespace-pre-wrap border-t border-line pt-2.5 leading-relaxed text-ink">
                {selected.description || 'La administración no agregó detalles adicionales para este evento.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Filas de resumen bajo el calendario: hoy / esta semana / este mes. */
export function SummaryRows({
  rows,
}: {
  rows: { label: string; items: { id: string; title: string; sub?: string }[] }[];
}) {
  return (
    <div className="card mt-3 divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-3 px-4 py-2.5">
          <p className="w-28 flex-none pt-1 text-[.64rem] font-bold uppercase tracking-wide text-muted">
            {row.label} ({row.items.length})
          </p>
          {row.items.length === 0 ? (
            <p className="pt-0.5 text-xs text-muted">Sin pendientes.</p>
          ) : (
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {row.items.map((item) => (
                <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-canvas px-2 py-1 text-[.7rem]">
                  <span className="truncate font-medium text-ink">{item.title}</span>
                  {item.sub && <span className="flex-none text-muted">· {item.sub}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
