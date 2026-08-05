'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, AlarmClock, CalendarClock, AlertTriangle } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/nav-config';
import { GlobalSearch } from './global-search';

export type TopbarNotification = {
  taskId: string;
  title: string;
  kind: 'vencida' | 'vence_hoy' | 'alarma';
  when: string;
};

const KIND_META = {
  vencida: { label: 'Vencida', icon: AlertTriangle, cls: 'text-danger' },
  vence_hoy: { label: 'Vence hoy', icon: CalendarClock, cls: 'text-warn' },
  alarma: { label: 'Alarma', icon: AlarmClock, cls: 'text-royal' },
} as const;

export function Topbar({ notifications = [] }: { notifications?: TopbarNotification[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const current = NAV_ITEMS.find((i) => i.href && pathname.startsWith(i.href));
  // /app/contabilidad es la segunda pestaña del módulo unificado.
  const crumb = current?.label ?? (pathname.startsWith('/app/contabilidad') ? 'Finanzas y Contabilidad' : 'ANEXYpro');

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <header className="flex h-16 flex-none items-center gap-4 border-b border-line bg-white px-6">
      <b className="text-sm text-ink">{crumb}</b>
      <GlobalSearch />
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative rounded-lg border border-line p-2 text-muted hover:bg-canvas"
          title="Notificaciones"
        >
          <Bell size={17} />
          {notifications.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[.65rem] font-bold text-white">
              {notifications.length}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-11 z-50 w-96 rounded-xl border border-line bg-white p-2 shadow-xl">
            <p className="px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              Alarmas de tareas ({notifications.length})
            </p>
            {notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted">Sin avisos pendientes. 🎉</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notifications.map((n) => {
                  const meta = KIND_META[n.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={`${n.taskId}-${n.kind}`}>
                      <Link
                        href="/app/gestion"
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-canvas"
                      >
                        <Icon size={15} className={`mt-0.5 flex-none ${meta.cls}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                          <span className={`text-xs font-semibold ${meta.cls}`}>
                            {meta.label} ·{' '}
                            {n.kind === 'alarma'
                              ? new Date(n.when).toLocaleString('es-CR', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : // fecha límite: @db.Date en UTC — se muestra el día calendario tal cual
                                new Date(n.when).toLocaleDateString('es-CR', { timeZone: 'UTC' })}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
