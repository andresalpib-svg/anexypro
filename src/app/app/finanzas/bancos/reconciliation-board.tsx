'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  Upload, Check, X, Link2, Unlink, Landmark, Plus, Sparkles, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  importStatementAction,
  confirmMatchAction,
  unmatchAction,
  ignoreAction,
  createAccountAction,
  type ActionState,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO } from '@/lib/fecha-local';

export type AccountRow = {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  balance: number;
  accountCode: string;
};

export type TxRow = {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  status: string;
  matchedType: string | null;
  matchedId: string | null;
  confidence: number | null;
};

export type CandidateRow = {
  id: string;
  type: 'payment' | 'expense_payment';
  date: string;
  amount: number;
  label: string;
  reference: string | null;
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', timeZone: 'UTC' });

function Submit({ label, busy, icon }: { label: string; busy: string; icon?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? busy : (<>{icon} {label}</>)}
    </button>
  );
}

function Errors({ state }: { state: ActionState }) {
  if (!state.formError && !state.errors) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((m, i) => (
          <p key={i} className="text-xs font-medium text-danger">{m?.[0]}</p>
        ))}
    </div>
  );
}

function NewAccountModal({
  condominiumId,
  accountOptions,
  onDone,
}: {
  condominiumId: string;
  accountOptions: { code: string; name: string }[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createAccountAction, {});
  useEffect(() => {
    if (state.success) { toast.success('Cuenta bancaria creada.'); onDone(); }
  }, [state.success, onDone]);

  return (
    <Modal title="Nueva cuenta bancaria" onClose={onDone} width="max-w-xl">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Banco</label>
            <input name="bankName" className="field-input" placeholder="BAC Credomatic" />
          </div>
          <div className="flex-1">
            <label className="field-label">Nombre de la cuenta</label>
            <input name="name" className="field-input" placeholder="Cuenta Corriente ₡" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Número de cuenta</label>
            <input name="accountNumber" className="field-input" />
          </div>
          <div>
            <label className="field-label">Moneda</label>
            <select name="currency" defaultValue="CRC" className="field-input w-28">
              <option value="CRC">Colones</option>
              <option value="USD">Dólares</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Cuenta contable espejo</label>
            <select name="accountCode" defaultValue={accountOptions[0]?.code} className="field-input">
              {accountOptions.map((a) => (
                <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Saldo de apertura</label>
            <input name="openingBalance" type="number" step="0.01" defaultValue="0" className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Desde</label>
            <input name="openingDate" type="date" defaultValue={hoyISO()} className="field-input w-40" />
          </div>
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-2">
          <Submit label="Crear cuenta" busy="Creando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Ventana para elegir a mano con qué registro casa un movimiento. */
function MatchModal({
  tx,
  candidates,
  condominiumId,
  currency,
  onDone,
}: {
  tx: TxRow;
  candidates: CandidateRow[];
  condominiumId: string;
  currency: string;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

  // Los del mismo monto van primero: es lo que el ojo busca.
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = Math.abs(tx.amount);
    return candidates
      .filter((c) => (q ? `${c.label} ${c.reference ?? ''}`.toLowerCase().includes(q) : true))
      .sort((a, b) => Math.abs(a.amount - wanted) - Math.abs(b.amount - wanted))
      .slice(0, 40);
  }, [candidates, query, tx.amount]);

  return (
    <Modal
      title="Conciliar movimiento"
      subtitle={`${fecha(tx.date)} · ${tx.description} · ${fmt(tx.amount)}`}
      onClose={onDone}
      width="max-w-2xl"
    >
      <div className="p-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por filial, proveedor o referencia…"
          className="field-input"
        />
        <ul className="mt-3 max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {listed.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted">Ningún registro coincide.</li>
          ) : (
            listed.map((c) => {
              const exact = Math.abs(Math.abs(tx.amount) - c.amount) < 0.01;
              return (
                <li key={`${c.type}-${c.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{c.label}</p>
                    <p className="text-xs text-muted">
                      {fecha(c.date)} · {c.type === 'payment' ? 'pago recibido' : 'pago de gasto'}
                      {c.reference && ` · ${c.reference}`}
                    </p>
                  </div>
                  <p className={`flex-none font-sans font-bold ${exact ? 'text-ok' : 'text-ink'}`}>
                    {fmt(c.amount)}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      enTransicion(startTransition, async () => {
                        const r = await confirmMatchAction(tx.id, condominiumId, { type: c.type, id: c.id });
                        if (r.ok) { toast.success('Conciliado. El sistema recordará este patrón.'); onDone(); }
                        else toast.error(r.error);
                      })
                    }
                    className="btn-primary flex-none py-1.5 text-xs"
                  >
                    <Link2 size={13} /> Conciliar
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Sparkles size={13} className="flex-none text-royal" />
          Al conciliar a mano, ANEXYpro guarda la relación con el texto del banco y la próxima vez lo resuelve solo.
        </p>
      </div>
    </Modal>
  );
}

export function ReconciliationBoard({
  condominiumId,
  accounts,
  selectedId,
  transactions,
  candidates,
  totals,
  assetAccounts,
  canManage,
}: {
  condominiumId: string;
  accounts: AccountRow[];
  selectedId: string | null;
  transactions: TxRow[];
  candidates: CandidateRow[];
  totals: { conciliado: number; propuesto: number; pendiente: number; ignorado: number };
  assetAccounts: { code: string; name: string }[];
  canManage: boolean;
}) {
  const [importState, importAction] = useFormState<ActionState, FormData>(importStatementAction, {});
  const [showAccount, setShowAccount] = useState(false);
  const [matching, setMatching] = useState<TxRow | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === selectedId);
  const currency = account?.currency ?? 'CRC';
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  useEffect(() => {
    if (importState.success && importState.message) toast.success(importState.message);
  }, [importState.success, importState.message]);

  const byStatus = (s: string) => transactions.filter((t) => t.status === s);
  const candidateOf = (t: TxRow) =>
    t.matchedId ? candidates.find((c) => c.id === t.matchedId) ?? null : null;

  if (accounts.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Landmark className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Este condominio todavía no tiene cuentas bancarias</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Registrá la cuenta del condominio para poder subir el estado de cuenta y conciliar los movimientos
          contra los pagos del sistema.
        </p>
        {canManage && (
          <button type="button" onClick={() => setShowAccount(true)} className="btn-primary mx-auto mt-4">
            <Plus size={15} /> Agregar cuenta bancaria
          </button>
        )}
        {showAccount && (
          <NewAccountModal condominiumId={condominiumId} accountOptions={assetAccounts} onDone={() => setShowAccount(false)} />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Cuentas */}
      <div className="flex flex-wrap gap-3">
        {accounts.map((a) => (
          <a
            key={a.id}
            href={`/app/finanzas/bancos?condoId=${condominiumId}&cuenta=${a.id}`}
            className={`card min-w-56 flex-1 p-4 transition ${a.id === selectedId ? 'border-royal ring-1 ring-royal/30' : 'hover:shadow-md'}`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{a.bankName}</p>
            <p className="text-sm text-ink">{a.name}</p>
            <p className="mt-1 font-sans text-lg font-bold text-ink">
              {new Intl.NumberFormat('es-CR', { style: 'currency', currency: a.currency, maximumFractionDigits: 0 }).format(a.balance)}
            </p>
            <p className="text-[.7rem] text-muted">····{a.accountNumber.slice(-4)}</p>
          </a>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAccount(true)}
            className="card flex min-w-40 items-center justify-center gap-2 p-4 text-sm font-semibold text-royal transition hover:shadow-md"
          >
            <Plus size={15} /> Agregar cuenta
          </button>
        )}
      </div>

      {/* Importar */}
      <form action={importAction} className="card mt-4 p-4">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="bankAccountId" value={selectedId ?? ''} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="field-label">Estado de cuenta del banco</label>
            <input name="statement" type="file" accept=".xlsx,.xls,.csv" className="field-input text-xs" />
          </div>
          <Submit label="Importar y conciliar" busy="Procesando…" icon={<Upload size={14} />} />
        </div>
        <Errors state={importState} />
        <p className="mt-2 text-[.7rem] text-muted">
          Subí el archivo tal como lo exporta tu banco (Excel o CSV). ANEXYpro detecta solo las columnas de
          fecha, detalle y monto, y descarta los movimientos que ya estaban importados.
        </p>
      </form>

      {/* Resumen */}
      <div className="mt-4 grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {[
          { label: 'Conciliados', value: totals.conciliado, tone: 'text-ok' },
          { label: 'Con propuesta', value: totals.propuesto, tone: 'text-warn' },
          { label: 'Por revisar', value: totals.pendiente, tone: 'text-danger' },
          { label: 'Ignorados', value: totals.ignorado, tone: 'text-muted' },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{k.label}</p>
            <p className={`mt-1 font-sans text-xl font-bold ${k.tone}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tres columnas: propuestos · por revisar · conciliados */}
      <div className="mt-4 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <Column
          title="Esperan tu confirmación"
          hint="El sistema encontró un candidato probable"
          rows={byStatus('propuesto')}
          empty="Nada por confirmar."
          fmt={fmt}
          render={(t) => {
            const c = candidateOf(t);
            return (
              <>
                {c && (
                  <p className="mt-1 rounded bg-royal-soft px-2 py-1 text-[.7rem] text-royal">
                    ¿Es <b>{c.label}</b>? · confianza {t.confidence}%
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      enTransicion(startTransition, async () => {
                        if (!c) return;
                        const r = await confirmMatchAction(t.id, condominiumId, { type: c.type, id: c.id });
                        if (r.ok) toast.success('Conciliado.');
                        else toast.error(r.error);
                      })
                    }
                    className="btn-primary py-1 text-[.7rem]"
                  >
                    <Check size={12} /> Sí, es correcto
                  </button>
                  <button type="button" onClick={() => setMatching(t)} className="btn-ghost py-1 text-[.7rem]">
                    Elegir otro
                  </button>
                </div>
              </>
            );
          }}
        />

        <Column
          title="Por revisar"
          hint="No se encontró a qué corresponden"
          rows={byStatus('sin_conciliar')}
          empty="Todo identificado."
          fmt={fmt}
          render={(t) => (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setMatching(t)} className="btn-primary py-1 text-[.7rem]">
                <Link2 size={12} /> Conciliar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  enTransicion(startTransition, async () => {
                    const r = await ignoreAction(t.id, condominiumId);
                    if (r.ok) toast.success('Movimiento ignorado.');
                    else toast.error(r.error);
                  })
                }
                className="btn-ghost py-1 text-[.7rem]"
              >
                <X size={12} /> Ignorar
              </button>
            </div>
          )}
        />

        <Column
          title="Conciliados"
          hint="Ya coinciden con el sistema"
          rows={byStatus('conciliado')}
          empty="Todavía no hay movimientos conciliados."
          fmt={fmt}
          render={(t) => {
            const c = candidateOf(t);
            return (
              <div className="mt-1 flex items-center gap-2">
                <StatusChip variant="ok">{c?.label ?? 'conciliado'}</StatusChip>
                <button
                  type="button"
                  disabled={pending}
                  title="Deshacer"
                  onClick={() =>
                    enTransicion(startTransition, async () => {
                      const r = await unmatchAction(t.id, condominiumId);
                      if (r.ok) toast.success('Conciliación deshecha.');
                      else toast.error(r.error);
                    })
                  }
                  className="ml-auto text-muted transition hover:text-danger"
                >
                  <Unlink size={13} />
                </button>
              </div>
            );
          }}
        />
      </div>

      {showAccount && (
        <NewAccountModal condominiumId={condominiumId} accountOptions={assetAccounts} onDone={() => setShowAccount(false)} />
      )}
      {matching && (
        <MatchModal
          tx={matching}
          candidates={candidates}
          condominiumId={condominiumId}
          currency={currency}
          onDone={() => setMatching(null)}
        />
      )}
    </div>
  );
}

function Column({
  title,
  hint,
  rows,
  empty,
  fmt,
  render,
}: {
  title: string;
  hint: string;
  rows: TxRow[];
  empty: string;
  fmt: (n: number) => string;
  render: (t: TxRow) => React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          {title} ({rows.length})
        </p>
        <p className="text-[.7rem] text-muted">{hint}</p>
      </div>
      <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
        {rows.length === 0 ? (
          <li className="p-8 text-center text-sm text-muted">{empty}</li>
        ) : (
          rows.map((t) => (
            <li key={t.id} className="px-4 py-3 text-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{t.description}</p>
                  <p className="text-xs text-muted">
                    {fecha(t.date)}
                    {t.reference && ` · ${t.reference}`}
                  </p>
                </div>
                <p className={`flex-none font-sans font-bold ${t.amount > 0 ? 'text-ok' : 'text-ink'}`}>
                  {fmt(t.amount)}
                </p>
              </div>
              {render(t)}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
