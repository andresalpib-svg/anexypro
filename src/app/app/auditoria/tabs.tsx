'use client';

import Link from 'next/link';
import { clsx } from 'clsx';

/**
 * Dos bitácoras, dos pestañas.
 *
 * "Actividad" es la de siempre: quién hizo qué y cuándo, en el
 * vocabulario del administrador. "Cambios" es la que faltaba (Etapa
 * 8): para las operaciones sensibles, qué valía el registro ANTES y
 * qué vale ahora.
 */
const TABS = [
  { key: 'actividad', label: 'Actividad' },
  { key: 'cambios', label: 'Cambios (antes / después)' },
];

export function AuditTabs({ tab }: { tab: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/app/auditoria?tab=${t.key}`}
          className={clsx(
            'border-b-2 px-4 py-2 text-sm font-medium',
            tab === t.key ? 'border-royal text-royal' : 'border-transparent text-muted hover:text-ink'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
