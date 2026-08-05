'use client';

import Link from 'next/link';
import { clsx } from 'clsx';

const TABS = [
  { key: 'diario', label: 'Libro Diario' },
  { key: 'balance', label: 'Balance General' },
  { key: 'resultados', label: 'Estado de Resultados' },
];

export function ReportTabs({ condoId, tab }: { condoId: string; tab: string }) {
  return (
    <div className="mt-4 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/app/contabilidad?condoId=${condoId}&tab=${t.key}`}
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
