'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Save, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { saveBudgetAction } from './actions';

export type BudgetRowView = {
  accountId: string;
  code: string;
  name: string;
  budgeted: number;
  executed: number;
  available: number;
  percent: number;
  lastYear: number;
  suggested: number;
};

/** Umbral → color. Es el mismo criterio del panel financiero. */
function tone(percent: number, budgeted: number): { bar: string; text: string } {
  if (budgeted === 0) return { bar: 'bg-line', text: 'text-muted' };
  if (percent >= 120) return { bar: 'bg-danger', text: 'text-danger font-semibold' };
  if (percent >= 100) return { bar: 'bg-danger/70', text: 'text-danger' };
  if (percent >= 80) return { bar: 'bg-warn', text: 'text-warn' };
  return { bar: 'bg-ok', text: 'text-ink' };
}

export function BudgetBoard({
  condominiumId,
  year,
  years,
  currency,
  rows,
  yearProgress,
  canEdit,
}: {
  condominiumId: string;
  year: number;
  years: number[];
  currency: string;
  rows: BudgetRowView[];
  yearProgress: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, number>>(
    Object.fromEntries(rows.map((r) => [r.accountId, r.budgeted]))
  );
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const totals = useMemo(() => {
    const budgeted = Object.values(draft).reduce((s, v) => s + (Number(v) || 0), 0);
    const executed = rows.reduce((s, r) => s + r.executed, 0);
    return { budgeted, executed, percent: budgeted > 0 ? (executed / budgeted) * 100 : 0 };
  }, [draft, rows]);

  const dirty = rows.some((r) => (draft[r.accountId] ?? 0) !== r.budgeted);
  const sinPresupuesto = totals.budgeted === 0;
  const excedidas = rows.filter((r) => r.budgeted > 0 && r.percent >= 100);

  const aplicarSugerencia = () => {
    setDraft(Object.fromEntries(rows.map((r) => [r.accountId, r.suggested])));
    toast.success('Se cargó la sugerencia. Revisá y ajustá antes de guardar.');
  };

  const guardar = () =>
    startTransition(async () => {
      const r = await saveBudgetAction(
        condominiumId,
        year,
        rows.map((row) => ({ accountId: row.accountId, amount: Number(draft[row.accountId]) || 0 }))
      );
      if (r.ok) {
        toast.success('Presupuesto guardado.');
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => router.push(`/app/finanzas/presupuesto?condoId=${condominiumId}&anio=${e.target.value}`)}
          className="field-input w-auto"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              Presupuesto {y}
            </option>
          ))}
        </select>
        {canEdit && (
          <>
            <button type="button" onClick={aplicarSugerencia} className="btn-ghost py-2 text-xs">
              <Sparkles size={14} /> Sugerir desde el año anterior
            </button>
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={guardar}
              className="btn-primary ml-auto py-2 text-xs disabled:opacity-40"
            >
              <Save size={14} /> {pending ? 'Guardando…' : 'Guardar presupuesto'}
            </button>
          </>
        )}
      </div>

      {sinPresupuesto && (
        <p className="mt-3 rounded-lg bg-royal-soft px-3 py-2 text-sm leading-relaxed text-ink">
          Este condominio todavía no tiene presupuesto para {year}. Usá <b>Sugerir desde el año anterior</b> para
          partir del gasto real y ajustar, en vez de construirlo desde cero.
        </p>
      )}

      {excedidas.length > 0 && (
        <div className="card mt-3 border-warn/40 bg-warn-bg/30 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle size={15} className="flex-none text-warn" />
            {excedidas.length} partida(s) superaron su presupuesto
          </p>
          <p className="mt-1 text-xs text-muted">
            {excedidas.map((r) => `${r.name} (${Math.round(r.percent)}%)`).join(' · ')}
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Presupuestado</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{fmt(totals.budgeted)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Ejecutado</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{fmt(totals.executed)}</p>
          <p className="text-[.7rem] text-muted">
            {Math.round(totals.percent)}% del presupuesto · {Math.round(yearProgress * 100)}% del año transcurrido
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Disponible</p>
          <p
            className={`mt-1 font-sans text-xl font-bold ${totals.budgeted - totals.executed < 0 ? 'text-danger' : 'text-ok'}`}
          >
            {fmt(totals.budgeted - totals.executed)}
          </p>
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Partida</th>
              <th className="px-4 py-3 text-right">Año anterior</th>
              <th className="px-4 py-3 text-right">Presupuesto {year}</th>
              <th className="px-4 py-3 text-right">Ejecutado</th>
              <th className="px-4 py-3 text-right">Disponible</th>
              <th className="w-40 px-4 py-3">Avance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const budgeted = Number(draft[r.accountId]) || 0;
              const percent = budgeted > 0 ? (r.executed / budgeted) * 100 : 0;
              const t = tone(percent, budgeted);
              return (
                <tr key={r.accountId} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{r.name}</p>
                    <p className="text-[.7rem] text-muted">{r.code}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted">{r.lastYear > 0 ? fmt(r.lastYear) : '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        value={budgeted || ''}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [r.accountId]: Number(e.target.value) || 0 }))
                        }
                        placeholder="0"
                        className="field-input w-32 text-right"
                      />
                    ) : (
                      fmt(budgeted)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-ink">{fmt(r.executed)}</td>
                  <td className={`px-4 py-2.5 text-right ${budgeted - r.executed < 0 ? 'text-danger' : 'text-muted'}`}>
                    {budgeted > 0 ? fmt(budgeted - r.executed) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {budgeted > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                          <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                        <span className={`w-11 text-right text-xs ${t.text}`}>{Math.round(percent)}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">sin presupuesto</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">
        El ejecutado cuenta solo los gastos <b>aprobados o pagados</b>. Un gasto en borrador todavía no
        compromete el presupuesto. El porcentaje del año transcurrido sirve de referencia: una partida en 90 %
        a mitad de año va mal aunque no haya llegado a 100.
      </p>
    </div>
  );
}
