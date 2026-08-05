'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';

/**
 * Finanzas y Contabilidad son UN módulo con dos vistas: la operación
 * (cuotas, pagos, morosidad) y su reflejo contable (partida doble).
 */
export function FinanceTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const condoId = params.get('condoId');
  const suffix = condoId ? `?condoId=${condoId}` : '';

  const tabs: { href: string; label: string; exact?: boolean }[] = [
    { href: '/app/finanzas/panel', label: 'Panel' },
    { href: '/app/finanzas', label: 'Cuotas y pagos', exact: true },
    { href: '/app/finanzas/gastos', label: 'Gastos' },
    { href: '/app/finanzas/recurrentes', label: 'Recurrentes' },
    { href: '/app/finanzas/bancos', label: 'Bancos' },
    { href: '/app/finanzas/flujo', label: 'Flujo de caja' },
    { href: '/app/finanzas/presupuesto', label: 'Presupuesto' },
    { href: '/app/finanzas/cobranza', label: 'Cobranza' },
    { href: '/app/finanzas/cierre', label: 'Cierre' },
    { href: '/app/finanzas/asistente', label: 'Asistente IA' },
    { href: '/app/contabilidad', label: 'Contabilidad' },
  ];

  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-canvas p-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={`${t.href}${suffix}`}
          className={clsx(
            'flex-1 rounded-lg px-4 py-2 text-center text-sm font-semibold transition',
            (t.exact ? pathname === t.href : pathname.startsWith(t.href))
              ? 'bg-white text-royal shadow-sm'
              : 'text-muted hover:text-ink'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
