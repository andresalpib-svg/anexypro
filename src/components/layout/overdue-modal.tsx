'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, ListChecks, Wrench } from 'lucide-react';
import type { OverdueItem } from '@/lib/services/overdue-briefing';

const COOKIE = 'anexypro-atrasos-visto';
const PRIORITY_CLASS: Record<string, string> = {
  alta: 'text-danger font-semibold',
  media: 'text-warn',
  baja: 'text-muted',
};

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function alreadySeenToday(): boolean {
  return document.cookie.split('; ').some((c) => c === `${COOKIE}=${todayStr()}`);
}

/**
 * Aviso de primera instancia: al ingresar por primera vez en el día,
 * la administración y la supervisión ven el resumen de lo que lleva
 * 2 o más días de atraso. Se cierra con la X o haciendo clic fuera, y
 * no vuelve a aparecer hasta el día siguiente.
 */
export function OverdueModal({ items, taskCount, ticketCount }: { items: OverdueItem[]; taskCount: number; ticketCount: number }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length > 0 && !alreadySeenToday()) setOpen(true);
  }, [items.length]);

  const dismiss = () => {
    document.cookie = `${COOKIE}=${todayStr()}; path=/; max-age=${60 * 60 * 24}`;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const tareas = items.filter((i) => i.kind === 'tarea');
  const tickets = items.filter((i) => i.kind === 'ticket');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-deep/60 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        // Clic FUERA del recuadro → cerrar.
        if (boxRef.current && !boxRef.current.contains(e.target as Node)) dismiss();
      }}
    >
      <div ref={boxRef} className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line bg-danger-bg/40 px-4 py-4 sm:px-6">
          <AlertTriangle className="mt-0.5 flex-none text-danger" size={22} />
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-lg font-extrabold text-ink">Pendientes con atraso</h2>
            <p className="text-sm text-muted">
              {items.length} pendiente(s) con 2 o más días de atraso
              {taskCount > 0 && ` · ${taskCount} tarea(s)`}
              {ticketCount > 0 && ` · ${ticketCount} ticket(s)`}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar aviso"
            className="flex-none rounded-lg p-1.5 text-muted transition hover:bg-white hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[52vh] overflow-y-auto px-4 py-4 sm:px-6">
          {tareas.length > 0 && (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <ListChecks size={13} /> Tareas ({tareas.length})
              </p>
              <ul className="mb-4 space-y-1.5">
                {tareas.map((i) => (
                  <Row key={i.id} item={i} />
                ))}
              </ul>
            </>
          )}
          {tickets.length > 0 && (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                <Wrench size={13} /> Tickets de mantenimiento ({tickets.length})
              </p>
              <ul className="space-y-1.5">
                {tickets.map((i) => (
                  <Row key={i.id} item={i} />
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-6">
          <Link href="/app/gestion" onClick={dismiss} className="btn-primary py-2 text-xs">
            Ir a Gestión de Tareas
          </Link>
          <Link href="/app/mantenimiento" onClick={dismiss} className="btn-ghost py-2 text-xs">
            Ir a Operativo
          </Link>
          <button type="button" onClick={dismiss} className="ml-auto text-xs font-semibold text-muted hover:text-ink">
            Cerrar y continuar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Row({ item }: { item: OverdueItem }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-canvas px-3 py-2 text-sm">
      <span className="flex h-7 w-12 flex-none items-center justify-center rounded-md bg-danger text-xs font-bold text-white">
        {item.daysLate}d
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{item.title}</span>
        <span className="block truncate text-xs text-muted">
          {item.reference}
          {item.origin === 'residente' && ' · reportado por un residente'}
        </span>
      </span>
      <span className={`flex-none text-xs uppercase ${PRIORITY_CLASS[item.priority] ?? 'text-muted'}`}>
        {item.priority}
      </span>
    </li>
  );
}
