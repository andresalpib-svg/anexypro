'use client';

import type { CashFlowMonth } from '@/lib/services/cash-flow';

/**
 * Flujo de caja en SVG.
 *
 * Regla de diseño innegociable: lo real y lo proyectado NUNCA se
 * dibujan con el mismo trazo. La proyección va punteada y con fondo
 * distinto — mezclar dato con estimación es la forma más común de
 * darle a un administrador una certeza que no tiene.
 */
export function CashFlowChart({ months, currency }: { months: CashFlowMonth[]; currency: string }) {
  const W = 900;
  const H = 260;
  const PAD = { top: 16, right: 12, bottom: 30, left: 64 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = months.flatMap((m) => [m.income, m.expense, m.balance]);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const x = (i: number) => PAD.left + (i * innerW) / Math.max(months.length - 1, 1);
  const y = (v: number) => PAD.top + innerH - ((v - min) / range) * innerH;

  const firstProjected = months.findIndex((m) => m.projected);
  const splitX = firstProjected > 0 ? x(firstProjected - 1) : null;

  const line = (pick: (m: CashFlowMonth) => number, filter: (m: CashFlowMonth) => boolean) =>
    months
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => filter(m))
      .map(({ m, i }, k) => `${k === 0 ? 'M' : 'L'} ${x(i)} ${y(pick(m))}`)
      .join(' ');

  const real = (m: CashFlowMonth) => !m.projected;
  // La proyección arranca en el último punto real para que la línea no
  // aparezca cortada.
  const proj = (m: CashFlowMonth, i: number) => m.projected || i === firstProjected - 1;
  const projLine = (pick: (m: CashFlowMonth) => number) =>
    months
      .map((m, i) => ({ m, i }))
      .filter(({ m, i }) => proj(m, i))
      .map(({ m, i }, k) => `${k === 0 ? 'M' : 'L'} ${x(i)} ${y(pick(m))}`)
      .join(' ');

  const fmtShort = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${Math.round(n / 1000)}k`;
    return String(Math.round(n));
  };

  const ticks = 4;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[720px]" role="img" aria-label="Flujo de caja">
        {/* Zona proyectada */}
        {splitX !== null && (
          <>
            <rect x={splitX} y={PAD.top} width={W - PAD.right - splitX} height={innerH} fill="#F8FAFC" />
            <line x1={splitX} y1={PAD.top} x2={splitX} y2={PAD.top + innerH} stroke="#CBD5E1" strokeDasharray="3 3" />
            <text x={splitX + 6} y={PAD.top + 12} fontSize="10" fill="#94A3B8">
              proyección
            </text>
          </>
        )}

        {/* Rejilla */}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = min + (range * i) / ticks;
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="#E2E8F0" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(v) + 3} fontSize="10" fill="#94A3B8" textAnchor="end">
                {fmtShort(v)}
              </text>
            </g>
          );
        })}

        {/* Líneas reales */}
        <path d={line((m) => m.income, real)} fill="none" stroke="#10B981" strokeWidth="2" />
        <path d={line((m) => m.expense, real)} fill="none" stroke="#F59E0B" strokeWidth="2" />
        <path d={line((m) => m.balance, real)} fill="none" stroke="#2B5CE6" strokeWidth="2.5" />

        {/* Líneas proyectadas: punteadas */}
        <path d={projLine((m) => m.income)} fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="5 4" opacity="0.75" />
        <path d={projLine((m) => m.expense)} fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="5 4" opacity="0.75" />
        <path d={projLine((m) => m.balance)} fill="none" stroke="#2B5CE6" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.75" />

        {/* Etiquetas de mes */}
        {months.map((m, i) =>
          i % 2 === 0 || months.length <= 10 ? (
            <text key={m.period} x={x(i)} y={H - 10} fontSize="10" fill="#64748B" textAnchor="middle">
              {m.label}
            </text>
          ) : null
        )}
      </svg>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-ok" /> Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-warn" /> Gastos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-royal" /> Saldo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 border-t-2 border-dashed border-muted" /> Proyectado
        </span>
      </div>
    </div>
  );
}
