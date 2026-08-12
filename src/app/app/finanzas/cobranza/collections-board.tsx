'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Handshake, Send, FileText, Plus, CheckCircle2, XCircle, Search, History } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  logActionAction,
  createPlanAction,
  setPlanStatusAction,
  listActionsAction,
  type ActionState,
  type ActionHistoryItem,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type DebtorView = {
  propertyId: string;
  code: string;
  ownerName: string | null;
  total: number;
  oldestDays: number;
  buckets: Record<string, number>;
  hasPlan: boolean;
  lastAction: { type: string; at: string } | null;
  suggestedStep: { type: string; label: string } | null;
};

export type PlanView = {
  id: string;
  propertyCode: string;
  totalDebt: number;
  downPayment: number;
  installments: number;
  startDate: string;
  status: string;
};

export type AgingView = {
  totals: Record<string, number>;
  total: number;
  overdue: number;
  overdueRatio: number;
};

const BUCKETS: { key: string; label: string; tone: string }[] = [
  { key: 'corriente', label: 'Al día', tone: 'bg-ok' },
  { key: 'd1_30', label: '1-30 días', tone: 'bg-lumen' },
  { key: 'd31_60', label: '31-60 días', tone: 'bg-warn' },
  { key: 'd61_90', label: '61-90 días', tone: 'bg-danger/70' },
  { key: 'd90_mas', label: '+90 días', tone: 'bg-danger' },
];

const ACTION_LABEL: Record<string, string> = {
  recordatorio: 'Recordatorio',
  aviso_vencido: 'Aviso de vencido',
  aviso_formal: 'Aviso formal',
  aviso_suspension: 'Aviso de suspensión',
  expediente_legal: 'Expediente legal',
  llamada: 'Llamada',
  nota: 'Nota',
};

const PLAN_VARIANT: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  vigente: 'ok',
  cumplido: 'neutral',
  incumplido: 'danger',
  cancelado: 'neutral',
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? busy : label}
    </button>
  );
}

function PlanModal({
  condominiumId,
  debtors,
  currency,
  preset,
  onDone,
}: {
  condominiumId: string;
  debtors: DebtorView[];
  currency: string;
  preset?: DebtorView;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createPlanAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Convenio registrado. Esta filial deja de devengar intereses mientras esté vigente.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title="Nuevo convenio de pago" onClose={onDone} width="max-w-xl">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <div>
          <label className="field-label">Filial</label>
          <select name="propertyId" defaultValue={preset?.propertyId ?? ''} className="field-input">
            <option value="">Elegí la filial</option>
            {debtors.map((d) => (
              <option key={d.propertyId} value={d.propertyId}>
                {d.code} {d.ownerName ? `— ${d.ownerName}` : ''} (debe{' '}
                {new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(d.total)})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Deuda total</label>
            <input
              name="totalDebt"
              type="number"
              step="0.01"
              min="0"
              defaultValue={preset?.total ?? ''}
              className="field-input w-40"
            />
          </div>
          <div>
            <label className="field-label">Prima</label>
            <input name="downPayment" type="number" step="0.01" min="0" defaultValue="0" className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Cuotas</label>
            <input name="installments" type="number" min="1" max="60" defaultValue="6" className="field-input w-28" />
          </div>
          <div>
            <label className="field-label">Desde</label>
            <input name="startDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
        </div>
        <div>
          <label className="field-label">Convenio firmado (opcional)</label>
          <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="field-input text-xs" />
        </div>
        <div>
          <label className="field-label">Notas</label>
          <textarea name="notes" rows={2} className="field-input" />
        </div>
        <p className="rounded-lg bg-royal-soft px-3 py-2 text-xs leading-relaxed text-ink">
          Mientras el convenio esté <b>vigente</b>, esta filial no devenga interés moratorio ni recibe avisos
          automáticos de cobro. Si se incumple, marcalo como tal y el cobro se reanuda.
        </p>
        {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
        {state.errors &&
          Object.values(state.errors).map((m, i) => (
            <p key={i} className="text-xs font-medium text-danger">
              {m?.[0]}
            </p>
          ))}
        <div className="flex gap-2 pt-1">
          <Submit label="Registrar convenio" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CollectionsBoard({
  condominiumId,
  currency,
  aging,
  debtors,
  plans,
  collectionRate,
  canManage,
}: {
  condominiumId: string;
  currency: string;
  aging: AgingView;
  debtors: DebtorView[];
  plans: PlanView[];
  collectionRate: number;
  canManage: boolean;
}) {
  const [showPlan, setShowPlan] = useState(false);
  const [preset, setPreset] = useState<DebtorView | undefined>();
  const [historyFor, setHistoryFor] = useState<DebtorView | null>(null);
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const pct = (v: number) => (aging.total > 0 ? (v / aging.total) * 100 : 0);

  // Búsqueda por número de filial (y de paso por propietario).
  const q = query.trim().toLowerCase();
  const visibleDebtors = q
    ? debtors.filter((d) => d.code.toLowerCase().includes(q) || (d.ownerName ?? '').toLowerCase().includes(q))
    : debtors;

  return (
    <div>
      {/* Indicadores */}
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Cartera total</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{fmt(aging.total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Cartera vencida</p>
          <p className="mt-1 font-sans text-xl font-bold text-danger">{fmt(aging.overdue)}</p>
        </div>
        <div className={`card p-4 ${aging.overdueRatio > 0.3 ? 'border-danger/40' : ''}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Índice de morosidad</p>
          <p
            className={`mt-1 font-sans text-xl font-bold ${
              aging.overdueRatio > 0.3 ? 'text-danger' : aging.overdueRatio > 0.15 ? 'text-warn' : 'text-ok'
            }`}
          >
            {Math.round(aging.overdueRatio * 100)}%
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Recuperación del mes</p>
          <p
            className={`mt-1 font-sans text-xl font-bold ${
              collectionRate >= 0.9 ? 'text-ok' : collectionRate >= 0.75 ? 'text-warn' : 'text-danger'
            }`}
          >
            {Math.round(collectionRate * 100)}%
          </p>
        </div>
      </div>

      {/* Antigüedad */}
      <div className="card mt-4 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Antigüedad de saldos</p>
        <div className="flex h-4 overflow-hidden rounded-full bg-canvas">
          {BUCKETS.map((b) => {
            const w = pct(aging.totals[b.key] ?? 0);
            return w > 0 ? <div key={b.key} className={b.tone} style={{ width: `${w}%` }} title={b.label} /> : null;
          })}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-3 max-lg:grid-cols-2">
          {BUCKETS.map((b) => (
            <div key={b.key}>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-2.5 w-2.5 rounded-sm ${b.tone}`} /> {b.label}
              </p>
              <p className="font-sans text-sm font-bold text-ink">{fmt(aging.totals[b.key] ?? 0)}</p>
              <p className="text-[.7rem] text-muted">{Math.round(pct(aging.totals[b.key] ?? 0))}%</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          El total de la cartera no dice nada por sí solo: {fmt(aging.total)} concentrados en el mes corriente
          es una situación sana; el mismo monto con más de 90 días es un problema de cobranza.
        </p>
      </div>

      {/* Deudores */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">
            Filiales en mora ({visibleDebtors.length}{q ? ` de ${debtors.length}` : ''})
          </p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar filial…"
              className="field-input w-44 py-1.5 pl-8 text-xs"
            />
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setPreset(undefined);
                setShowPlan(true);
              }}
              className="btn-ghost py-1.5 text-xs"
            >
              <Plus size={13} /> Convenio de pago
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Filial</th>
              <th className="px-4 py-3 text-right">Debe</th>
              <th className="px-4 py-3 text-right">Días</th>
              <th className="px-4 py-3">Última gestión</th>
              <th className="px-4 py-3">Acción sugerida</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleDebtors.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  <CheckCircle2 className="mx-auto mb-2 text-ok" size={22} />
                  {debtors.length === 0
                    ? 'Ninguna filial en mora. Todo al día.'
                    : 'Ninguna filial coincide con la búsqueda.'}
                </td>
              </tr>
            ) : (
              visibleDebtors.map((d) => (
                <tr key={d.propertyId} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    {/* Seleccionar la filial abre su histórico de gestión. */}
                    <button
                      type="button"
                      onClick={() => setHistoryFor(d)}
                      title="Ver histórico de gestión de cobranza"
                      className="text-left"
                    >
                      <p className="font-medium text-royal hover:underline">{d.code}</p>
                      {d.ownerName && <p className="text-xs text-muted">{d.ownerName}</p>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-sans font-bold text-ink">{fmt(d.total)}</td>
                  <td
                    className={`px-4 py-3 text-right ${
                      d.oldestDays > 90 ? 'font-semibold text-danger' : d.oldestDays > 30 ? 'text-warn' : 'text-muted'
                    }`}
                  >
                    {d.oldestDays}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {d.lastAction ? `${ACTION_LABEL[d.lastAction.type] ?? d.lastAction.type} · ${fecha(d.lastAction.at)}` : 'sin gestión'}
                  </td>
                  <td className="px-4 py-3">
                    {d.hasPlan ? (
                      <StatusChip variant="royal">Convenio vigente</StatusChip>
                    ) : d.suggestedStep ? (
                      <span className="text-xs text-ink">{d.suggestedStep.label}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canManage && !d.hasPlan && d.suggestedStep && (
                        <button
                          type="button"
                          disabled={pending}
                          title="Registrar esta gestión"
                          onClick={() =>
                            enTransicion(startTransition, async () => {
                              const r = await logActionAction({
                                condominiumId,
                                propertyId: d.propertyId,
                                actionType: d.suggestedStep!.type,
                                channel: 'manual',
                                notes: d.suggestedStep!.label,
                                debtAmount: d.total,
                                daysOverdue: d.oldestDays,
                              });
                              if (r.ok) toast.success('Gestión registrada.');
                              else toast.error(r.error);
                            })
                          }
                          className="text-royal transition hover:opacity-70"
                        >
                          <Send size={15} />
                        </button>
                      )}
                      {canManage && !d.hasPlan && (
                        <button
                          type="button"
                          title="Hacer convenio de pago"
                          onClick={() => {
                            setPreset(d);
                            setShowPlan(true);
                          }}
                          className="text-muted transition hover:text-royal"
                        >
                          <Handshake size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Convenios */}
      <div className="card mt-4 overflow-hidden">
        <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          Convenios de pago ({plans.length})
        </p>
        <ul className="divide-y divide-line">
          {plans.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted">
              Sin convenios registrados. Un convenio suspende el interés y los avisos automáticos mientras se
              cumpla.
            </li>
          ) : (
            plans.map((pl) => (
              <li key={pl.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{pl.propertyCode}</p>
                  <p className="text-xs text-muted">
                    {fmt(pl.totalDebt)} en {pl.installments} cuota(s)
                    {pl.downPayment > 0 && ` · prima ${fmt(pl.downPayment)}`} · desde {fecha(pl.startDate)}
                  </p>
                </div>
                <StatusChip variant={PLAN_VARIANT[pl.status] ?? 'neutral'}>{pl.status}</StatusChip>
                {canManage && pl.status === 'vigente' && (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      title="Marcar como cumplido"
                      onClick={() =>
                        enTransicion(startTransition, async () => {
                          const r = await setPlanStatusAction(pl.id, condominiumId, 'cumplido');
                          if (r.ok) toast.success('Convenio cumplido.');
                          else toast.error(r.error);
                        })
                      }
                      className="text-ok transition hover:opacity-70"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      title="Marcar como incumplido (se reanuda el cobro)"
                      onClick={() => {
                        if (!window.confirm('¿Marcar el convenio como incumplido? La filial vuelve a devengar intereses y a recibir avisos.')) return;
                        enTransicion(startTransition, async () => {
                          const r = await setPlanStatusAction(pl.id, condominiumId, 'incumplido');
                          if (r.ok) toast.success('Convenio incumplido. Se reanuda el cobro.');
                          else toast.error(r.error);
                        });
                      }}
                      className="text-muted transition hover:text-danger"
                    >
                      <XCircle size={15} />
                    </button>
                  </>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      {showPlan && (
        <PlanModal
          condominiumId={condominiumId}
          debtors={debtors}
          currency={currency}
          preset={preset}
          onDone={() => {
            setShowPlan(false);
            setPreset(undefined);
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          condominiumId={condominiumId}
          debtor={historyFor}
          currency={currency}
          canManage={canManage}
          onDone={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

/**
 * Histórico de gestión de cobranza de una filial + registro de nuevos
 * comentarios. Se carga al abrir (no viaja con la página: son hasta 30
 * gestiones por filial que casi nunca se consultan).
 */
function HistoryModal({
  condominiumId,
  debtor,
  currency,
  canManage,
  onDone,
}: {
  condominiumId: string;
  debtor: DebtorView;
  currency: string;
  canManage: boolean;
  onDone: () => void;
}) {
  const [items, setItems] = useState<ActionHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState('nota');
  const [notes, setNotes] = useState('');
  const [saving, startSaving] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const load = async () => {
    const r = await listActionsAction(condominiumId, debtor.propertyId);
    if (r.ok && r.items) setItems(r.items);
    else setError(r.error ?? 'No se pudo cargar el histórico.');
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condominiumId, debtor.propertyId]);

  const agregar = () => {
    const text = notes.trim();
    if (!text) {
      toast.error('Escribí el comentario antes de guardarlo.');
      return;
    }
    enTransicion(startSaving, async () => {
      const r = await logActionAction({
        condominiumId,
        propertyId: debtor.propertyId,
        actionType,
        channel: 'manual',
        notes: text,
        debtAmount: debtor.total,
        daysOverdue: debtor.oldestDays,
      });
      if (r.ok) {
        toast.success('Gestión registrada en el expediente.');
        setNotes('');
        setItems(null);
        await load();
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <Modal
      title={`Gestión de cobranza — ${debtor.code}`}
      subtitle={`${debtor.ownerName ?? 'Sin propietario registrado'} · debe ${fmt(debtor.total)} · ${debtor.oldestDays} días de atraso`}
      onClose={onDone}
      width="max-w-2xl"
    >
      <div className="p-5">
        {canManage && (
          <div className="mb-4 rounded-xl border border-line bg-canvas p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Agregar comentario</p>
            <div className="flex flex-wrap items-start gap-2">
              <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="field-input w-auto text-xs">
                {Object.entries(ACTION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ej: Se conversó con el propietario; se compromete a pagar el 15."
                className="field-input min-w-56 flex-1 text-xs"
              />
              <button type="button" disabled={saving} onClick={agregar} className="btn-primary py-2 text-xs">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <p className="mt-2 text-[.68rem] text-muted">
              Cada anotación queda en la bitácora con fecha, deuda y días de atraso al momento — es la
              prueba de gestión si el caso llega a cobro judicial.
            </p>
          </div>
        )}

        {error ? (
          <p className="py-8 text-center text-sm text-danger">{error}</p>
        ) : items === null ? (
          <p className="py-8 text-center text-sm text-muted">Cargando histórico…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            <History size={20} className="mx-auto mb-2" />
            Sin gestiones registradas para esta filial todavía.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{ACTION_LABEL[a.actionType] ?? a.actionType}</span>
                  <StatusChip variant={a.automated ? 'neutral' : 'royal'}>
                    {a.automated ? 'Automática' : 'Manual'}
                  </StatusChip>
                  <span className="ml-auto text-xs text-muted">
                    {new Date(a.createdAt).toLocaleString('es-CR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {a.notes && <p className="mt-1 text-sm text-ink">{a.notes}</p>}
                <p className="mt-0.5 text-[.7rem] text-muted">
                  {a.debtAmount !== null && `Deuda al momento: ${fmt(a.debtAmount)}`}
                  {a.daysOverdue !== null && ` · ${a.daysOverdue} días de atraso`}
                  {a.channel && ` · canal: ${a.channel}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
