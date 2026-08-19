'use client';

import { useRef, useEffect, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Wallet, Plus, Ban, Paperclip, TrendingDown, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { isLegacyPublicRef } from '@/lib/rutas-archivo';
import {
  allocateAction,
  addExpenseAction,
  voidExpenseAction,
  voidAllocationAction,
  type ActionState,
} from './petty-cash-actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type CashMovement = {
  id: string;
  date: string; // ISO
  detail: string;
  amount: number;
  author: string | null;
  invoiceUrl?: string | null;
  invoiceName?: string | null;
  /** Anulado: sigue en el informe, marcado, pero no cuenta para el saldo. */
  voidedAt?: string | null;
  voidReason?: string | null;
};

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

/**
 * Un movimiento de caja chica no se borra: se anula, y hay que decir
 * por qué. Devuelve `null` si la persona se arrepiente o no escribe un
 * motivo utilizable — el servidor exige lo mismo, esto solo evita el
 * viaje.
 */
function pedirMotivo(titulo: string): string | null {
  const motivo = window.prompt(`${titulo}. Queda registrado como anulado, no desaparece.\n\n¿Por qué se anula?`);
  if (motivo === null) return null;
  if (motivo.trim().length < 5) {
    toast.error('Escribí el motivo de la anulación (al menos 5 caracteres).');
    return null;
  }
  return motivo;
}

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

function Errors({ state }: { state: ActionState }) {
  if (!state.formError && !state.errors) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((msgs, i) => (
          <p key={i} className="text-xs font-medium text-danger">
            {msgs?.[0]}
          </p>
        ))}
    </div>
  );
}

export function PettyCash({
  condominiumId,
  currency,
  assigned,
  spent,
  balance,
  allocations,
  expenses,
  canAllocate,
}: {
  condominiumId: string;
  currency: string;
  assigned: number;
  spent: number;
  balance: number;
  allocations: CashMovement[];
  expenses: CashMovement[];
  /** Solo la administración asigna el monto disponible. */
  canAllocate: boolean;
}) {
  const [allocState, allocFormAction] = useFormState<ActionState, FormData>(allocateAction, {});
  const [expState, expFormAction] = useFormState<ActionState, FormData>(addExpenseAction, {});
  const allocRef = useRef<HTMLFormElement>(null);
  const expRef = useRef<HTMLFormElement>(null);
  const [showAlloc, setShowAlloc] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (allocState.success) {
      allocRef.current?.reset();
      setShowAlloc(false);
      toast.success('Monto asignado a la caja chica.');
    }
  }, [allocState.success]);
  useEffect(() => {
    if (expState.success) {
      expRef.current?.reset();
      toast.success('Gasto registrado.');
    }
  }, [expState.success]);

  const usedPct = assigned > 0 ? Math.min(100, Math.round((spent / assigned) * 100)) : 0;

  return (
    <div>
      {/* ---------- Resumen ---------- */}
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-soft text-royal">
            <Banknote size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{fmt(assigned, currency)}</p>
          <p className="text-sm text-muted">Monto asignado</p>
        </div>
        <div className="card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn-bg text-warn">
            <TrendingDown size={18} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{fmt(spent, currency)}</p>
          <p className="text-sm text-muted">Gastado ({usedPct}%)</p>
        </div>
        <div className="card p-5">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              balance > 0 ? 'bg-ok/15 text-ok' : 'bg-danger-bg text-danger'
            }`}
          >
            <Wallet size={18} />
          </span>
          <p className={`mt-3 font-sans text-xl font-bold ${balance > 0 ? 'text-ink' : 'text-danger'}`}>
            {fmt(balance, currency)}
          </p>
          <p className="text-sm text-muted">Saldo disponible</p>
        </div>
      </div>

      {assigned > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
          <div
            className={`h-full rounded-full transition-all ${usedPct >= 90 ? 'bg-danger' : usedPct >= 70 ? 'bg-warn' : 'bg-ok'}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      )}

      {/* ---------- Asignación (solo administración) ---------- */}
      {canAllocate && (
        <div className="mt-5">
          {!showAlloc ? (
            <button type="button" onClick={() => setShowAlloc(true)} className="btn-ghost py-2 text-xs">
              <Plus size={14} /> Asignar monto a la caja chica
            </button>
          ) : (
            <form ref={allocRef} action={allocFormAction} className="card p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                Monto disponible para gastos operativos
              </p>
              <input type="hidden" name="condominiumId" value={condominiumId} />
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="field-label">Fecha</label>
                  <input name="allocatedOn" type="date" defaultValue={hoy()} className="field-input w-40" />
                </div>
                <div>
                  <label className="field-label">Monto</label>
                  <input name="amount" type="number" step="0.01" min="0" placeholder="150000" className="field-input w-40" />
                </div>
                <div className="min-w-56 flex-1">
                  <label className="field-label">Nota (opcional)</label>
                  <input name="note" placeholder="Ej: Reposición de julio" className="field-input" />
                </div>
                <Submit label="Asignar" busy="Asignando…" />
                <button type="button" onClick={() => setShowAlloc(false)} className="btn-ghost py-2 text-xs">
                  Cancelar
                </button>
              </div>
              <Errors state={allocState} />
              <p className="mt-2 text-[.7rem] text-muted">
                Cada asignación queda registrada por separado — así el informe conserva el historial de
                reposiciones en lugar de sobrescribir el monto anterior.
              </p>
            </form>
          )}
        </div>
      )}

      {/* ---------- Registrar gasto ---------- */}
      <form ref={expRef} action={expFormAction} className="card mt-5 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Registrar gasto</p>
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Fecha de la compra</label>
            <input name="spentOn" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
          <div className="min-w-64 flex-1">
            <label className="field-label">Detalle del gasto</label>
            <input name="detail" placeholder="Ej: Bombillos LED para el pasillo 2" className="field-input" />
          </div>
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" placeholder="12500" className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Factura</label>
            <input
              name="invoice"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="field-input w-56 text-xs"
            />
          </div>
          <Submit label="Registrar gasto" busy="Registrando…" />
        </div>
        <Errors state={expState} />
        {balance <= 0 && assigned > 0 && (
          <p className="mt-2 text-xs font-medium text-danger">
            La caja chica no tiene saldo. Solicita a la administración una nueva asignación antes de registrar
            más gastos.
          </p>
        )}
      </form>

      {/* ---------- Movimientos ---------- */}
      <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div className="card overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            Gastos ({expenses.length})
          </p>
          <ul className="divide-y divide-line">
            {expenses.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">Sin gastos registrados.</li>
            ) : (
              expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium text-ink ${e.voidedAt ? 'line-through opacity-60' : ''}`}>
                      {e.detail}
                      {e.voidedAt && <span className="ml-2 text-xs font-semibold text-danger">ANULADO</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {fecha(e.date)}
                      {e.author && ` · ${e.author}`}
                      {e.voidReason && ` · Anulado: ${e.voidReason}`}
                    </p>
                    {/*
                      Las subidas anteriores al repositorio privado
                      apuntan a `/uploads/...`, una carpeta que ya no
                      existe: el enlace daba 404 sin avisar de nada. Se
                      muestra el nombre, pero no como algo que se pueda
                      abrir.
                    */}
                    {e.invoiceUrl &&
                      (isLegacyPublicRef(e.invoiceUrl) ? (
                        <p
                          title="El archivo se subió antes del repositorio privado y ya no está disponible."
                          className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"
                        >
                          <Paperclip size={12} /> {e.invoiceName ?? 'Factura'} · no disponible
                        </p>
                      ) : (
                        <a
                          href={e.invoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
                        >
                          <Paperclip size={12} /> {e.invoiceName ?? 'Factura'}
                        </a>
                      ))}
                  </div>
                  <p className={`flex-none font-sans font-bold ${e.voidedAt ? 'text-muted line-through' : 'text-ink'}`}>
                    {fmt(e.amount, currency)}
                  </p>
                  {!e.voidedAt && (
                    <button
                      type="button"
                      disabled={pending}
                      title="Anular gasto"
                      onClick={() => {
                        const motivo = pedirMotivo(`Anular el gasto "${e.detail}"`);
                        if (motivo === null) return;
                        enTransicion(startTransition, async () => {
                          const r = await voidExpenseAction(e.id, condominiumId, motivo);
                          if (r.ok) toast.success('Gasto anulado.');
                          else toast.error(r.error);
                        });
                      }}
                      className="flex-none text-muted transition hover:text-danger"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="card overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
            Asignaciones ({allocations.length})
          </p>
          <ul className="divide-y divide-line">
            {allocations.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">
                La administración todavía no ha asignado dinero a esta caja chica.
              </li>
            ) : (
              allocations.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium text-ink ${a.voidedAt ? 'line-through opacity-60' : ''}`}>
                      {a.detail || 'Asignación'}
                      {a.voidedAt && <span className="ml-2 text-xs font-semibold text-danger">ANULADA</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {fecha(a.date)}
                      {a.author && ` · ${a.author}`}
                      {a.voidReason && ` · Anulada: ${a.voidReason}`}
                    </p>
                  </div>
                  <p className={`flex-none font-sans font-bold ${a.voidedAt ? 'text-muted line-through' : 'text-ok'}`}>
                    +{fmt(a.amount, currency)}
                  </p>
                  {canAllocate && !a.voidedAt && (
                    <button
                      type="button"
                      disabled={pending}
                      title="Anular asignación"
                      onClick={() => {
                        const motivo = pedirMotivo('Anular esta asignación. El saldo disponible se reducirá');
                        if (motivo === null) return;
                        enTransicion(startTransition, async () => {
                          const r = await voidAllocationAction(a.id, condominiumId, motivo);
                          if (r.ok) toast.success('Asignación anulada.');
                          else toast.error(r.error);
                        });
                      }}
                      className="flex-none text-muted transition hover:text-danger"
                    >
                      <Ban size={14} />
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
