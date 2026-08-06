'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Lock, Unlock, CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { closePeriodAction, reopenPeriodAction } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type CheckView = { key: string; label: string; ok: boolean; detail: string };
export type PeriodView = { period: string; status: string; closedAt: string | null; closedBy: string | null };

const MES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const nombreMes = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return `${MES[(m ?? 1) - 1]} ${y}`;
};

export function CloseBoard({
  condominiumId,
  period,
  periods,
  checks,
  isClosed,
  canClose,
}: {
  condominiumId: string;
  period: string;
  periods: PeriodView[];
  checks: CheckView[];
  isClosed: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const listo = checks.every((c) => c.ok);

  // Últimos 12 meses para el selector.
  const opciones: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    opciones.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={period}
          onChange={(e) => router.push(`/app/finanzas/cierre?condoId=${condominiumId}&periodo=${e.target.value}`)}
          className="field-input w-auto min-w-48"
        >
          {opciones.map((p) => (
            <option key={p} value={p}>
              {nombreMes(p)}
            </option>
          ))}
        </select>
        {isClosed ? (
          <StatusChip variant="ok">Mes cerrado</StatusChip>
        ) : (
          <StatusChip variant="warn">Mes abierto</StatusChip>
        )}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <p className="font-sans text-base font-bold text-ink">
            {isClosed ? 'Este mes ya está cerrado' : `Verificaciones para cerrar ${nombreMes(period)}`}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {isClosed
              ? 'Los asientos con fecha en este mes están bloqueados. Los estados financieros ya no cambian.'
              : 'Cerrar el mes congela los estados financieros: nadie podrá registrar movimientos con fecha en este período.'}
          </p>
        </div>

        <ul className="divide-y divide-line">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-5 py-3.5">
              {c.ok ? (
                <CheckCircle2 size={18} className="mt-0.5 flex-none text-ok" />
              ) : (
                <AlertCircle size={18} className="mt-0.5 flex-none text-warn" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${c.ok ? 'text-ink' : 'text-ink'}`}>{c.label}</p>
                <p className="text-xs text-muted">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-canvas px-5 py-4">
          {isClosed ? (
            canClose && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const reason = window.prompt(
                    '¿Por qué se reabre este mes? El motivo queda registrado en la auditoría.'
                  );
                  if (!reason) return;
                  enTransicion(startTransition, async () => {
                    const r = await reopenPeriodAction(condominiumId, period, reason);
                    if (r.ok) {
                      toast.success('Mes reabierto.');
                      router.refresh();
                    } else toast.error(r.error);
                  });
                }}
                className="btn-ghost py-2 text-xs"
              >
                <Unlock size={14} /> Reabrir el mes
              </button>
            )
          ) : (
            <>
              <button
                type="button"
                disabled={!listo || !canClose || pending}
                onClick={() =>
                  enTransicion(startTransition, async () => {
                    const r = await closePeriodAction(condominiumId, period);
                    if (r.ok) {
                      toast.success(`${nombreMes(period)} cerrado.`);
                      router.refresh();
                    } else toast.error(r.error);
                  })
                }
                className="btn-primary py-2 text-xs disabled:opacity-40"
              >
                <Lock size={14} /> {pending ? 'Cerrando…' : `Cerrar ${nombreMes(period)}`}
              </button>
              {!listo && (
                <p className="text-xs text-muted">
                  Resolvé los puntos marcados antes de cerrar. No se puede cerrar un mes que no cuadra.
                </p>
              )}
              {!canClose && (
                <p className="text-xs text-muted">Solo la administración propietaria puede cerrar el mes.</p>
              )}
            </>
          )}
        </div>
      </div>

      {periods.length > 0 && (
        <div className="card mt-4 overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            Historial de cierres
          </p>
          <ul className="divide-y divide-line">
            {periods.map((p) => (
              <li key={p.period} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <CalendarCheck size={15} className="flex-none text-muted" />
                <span className="flex-1 text-ink">{nombreMes(p.period)}</span>
                {p.closedBy && <span className="text-xs text-muted">cerrado por {p.closedBy}</span>}
                <StatusChip variant={p.status === 'cerrado' ? 'ok' : 'warn'}>
                  {p.status === 'cerrado' ? 'Cerrado' : 'Reabierto'}
                </StatusChip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
