'use client';

import Link from 'next/link';
import { clsx } from 'clsx';

const TABS = [
  { key: 'financiero', label: 'Financiero' },
  { key: 'resumen', label: 'Resumen financiero' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'egresos', label: 'Egresos' },
  { key: 'morosidad', label: 'Morosidad' },
  { key: 'fondos', label: 'Fondos' },
  { key: 'inversiones', label: 'Inversiones' },
  { key: 'intereses', label: 'Intereses' },
  { key: 'activos', label: 'Activos' },
  { key: 'depreciaciones', label: 'Depreciaciones' },
  { key: 'presupuesto', label: 'Presupuesto' },
  { key: 'mantenimiento', label: 'Mantenimiento' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'incumplimientos', label: 'Gestión de Incumplimientos' },
];

export function ReportTabsNav({ tab }: { tab: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/app/reportes?tab=${t.key}`}
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
