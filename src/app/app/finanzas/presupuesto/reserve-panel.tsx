'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { PiggyBank, Plus, Minus, Trash2, Settings2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { saveFundAction, addMovementAction, deleteMovementAction, type ActionState } from './reserve-actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type FundView = {
  id: string;
  name: string;
  targetAmount: number | null;
  monthlyQuota: number;
  contributed: number;
  used: number;
  balance: number;
  progress: number | null;
  monthsCovered: number | null;
};

export type MovementView = {
  id: string;
  movType: string;
  amount: number;
  movDate: string;
  description: string;
  reference: string | null;
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

function Errors({ state }: { state: ActionState }) {
  if (!state.formError && !state.errors) return null;
  return (
    <div className="space-y-0.5">
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((m, i) => (
          <p key={i} className="text-xs font-medium text-danger">
            {m?.[0]}
          </p>
        ))}
    </div>
  );
}

function FundModal({
  condominiumId,
  fund,
  onDone,
}: {
  condominiumId: string;
  fund: FundView | null;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveFundAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Fondo de reserva guardado.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title={fund ? 'Configurar el fondo de reserva' : 'Crear el fondo de reserva'} onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        {fund && <input type="hidden" name="id" value={fund.id} />}
        <div>
          <label className="field-label">Nombre</label>
          <input name="name" defaultValue={fund?.name ?? 'Fondo de reserva'} className="field-input" />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Meta (opcional)</label>
            <input
              name="targetAmount"
              type="number"
              step="1000"
              min="0"
              defaultValue={fund?.targetAmount ?? ''}
              className="field-input"
            />
          </div>
          <div className="flex-1">
            <label className="field-label">Cuota mensual acordada</label>
            <input
              name="monthlyQuota"
              type="number"
              step="1000"
              min="0"
              defaultValue={fund?.monthlyQuota ?? 0}
              className="field-input"
            />
          </div>
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Guardar" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MovementModal({
  condominiumId,
  fundId,
  movType,
  onDone,
}: {
  condominiumId: string;
  fundId: string;
  movType: 'aporte' | 'uso';
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(addMovementAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success(movType === 'aporte' ? 'Aporte registrado.' : 'Uso registrado.');
      onDone();
    }
  }, [state.success, movType, onDone]);

  return (
    <Modal
      title={movType === 'aporte' ? 'Aporte al fondo de reserva' : 'Uso del fondo de reserva'}
      onClose={onDone}
      width="max-w-lg"
    >
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="fundId" value={fundId} />
        <input type="hidden" name="movType" value={movType} />
        <div className="flex gap-3">
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Fecha</label>
            <input name="movDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <input
            name="description"
            className="field-input"
            placeholder={movType === 'aporte' ? 'Aporte mensual de julio' : 'Reparación de la bomba de agua'}
          />
        </div>
        <div>
          <label className="field-label">
            {movType === 'uso' ? 'Acuerdo de asamblea que lo respalda' : 'Referencia (opcional)'}
          </label>
          <input
            name="reference"
            className="field-input"
            placeholder={movType === 'uso' ? 'Acuerdo asamblea 04-2026' : ''}
          />
        </div>
        {movType === 'uso' && (
          <p className="rounded-lg bg-warn-bg/40 px-3 py-2 text-xs leading-relaxed text-ink">
            El fondo de reserva es dinero que los propietarios apartaron para un fin específico. Todo uso queda
            registrado con su respaldo: es lo que se pregunta en asamblea.
          </p>
        )}
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Registrar" busy="Registrando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ReservePanel({
  condominiumId,
  currency,
  fund,
  movements,
  canManage,
}: {
  condominiumId: string;
  currency: string;
  fund: FundView | null;
  movements: MovementView[];
  canManage: boolean;
}) {
  const [showFund, setShowFund] = useState(false);
  const [movType, setMovType] = useState<'aporte' | 'uso' | null>(null);
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  if (!fund) {
    return (
      <div className="card mt-6 p-8 text-center">
        <PiggyBank className="mx-auto mb-3 text-muted" size={26} />
        <p className="text-sm font-semibold text-ink">Este condominio no tiene fondo de reserva</p>
        <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
          El fondo de reserva es el respaldo para imprevistos y obras mayores. Sin él, cualquier reparación
          grande se convierte en una cuota extraordinaria.
        </p>
        {canManage && (
          <button type="button" onClick={() => setShowFund(true)} className="btn-primary mx-auto mt-4">
            <Plus size={15} /> Crear el fondo de reserva
          </button>
        )}
        {showFund && <FundModal condominiumId={condominiumId} fund={null} onDone={() => setShowFund(false)} />}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <PiggyBank size={16} className="flex-none text-royal" />
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">{fund.name}</p>
        {canManage && (
          <>
            <button type="button" onClick={() => setMovType('aporte')} className="btn-ghost py-1.5 text-xs">
              <Plus size={13} /> Aporte
            </button>
            <button type="button" onClick={() => setMovType('uso')} className="btn-ghost py-1.5 text-xs">
              <Minus size={13} /> Uso
            </button>
            <button type="button" onClick={() => setShowFund(true)} className="btn-ghost py-1.5 text-xs">
              <Settings2 size={13} /> Configurar
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Saldo del fondo</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{fmt(fund.balance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Aportado</p>
          <p className="mt-1 font-sans text-xl font-bold text-ok">{fmt(fund.contributed)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Utilizado</p>
          <p className="mt-1 font-sans text-xl font-bold text-warn">{fmt(fund.used)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Meses de operación</p>
          <p
            className={`mt-1 font-sans text-xl font-bold ${
              fund.monthsCovered === null
                ? 'text-muted'
                : fund.monthsCovered > 3
                  ? 'text-ok'
                  : fund.monthsCovered >= 1.5
                    ? 'text-warn'
                    : 'text-danger'
            }`}
          >
            {fund.monthsCovered !== null ? fund.monthsCovered.toFixed(1) : '—'}
          </p>
        </div>
      </div>

      {fund.targetAmount && fund.progress !== null && (
        <div className="card mt-3 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Avance hacia la meta de {fmt(fund.targetAmount)}</span>
            <span className="font-sans font-bold text-ink">{Math.round(fund.progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-canvas">
            <div className="h-full rounded-full bg-royal" style={{ width: `${fund.progress * 100}%` }} />
          </div>
          {fund.monthlyQuota > 0 && fund.progress < 1 && (
            <p className="mt-2 text-xs text-muted">
              Al ritmo de {fmt(fund.monthlyQuota)} al mes, faltan aproximadamente{' '}
              {Math.ceil((fund.targetAmount - fund.balance) / fund.monthlyQuota)} meses.
            </p>
          )}
        </div>
      )}

      <div className="card mt-3 overflow-hidden">
        <p className="border-b border-line px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted">
          Movimientos ({movements.length})
        </p>
        <ul className="divide-y divide-line">
          {movements.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted">Sin movimientos todavía.</li>
          ) : (
            movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{m.description}</p>
                  <p className="text-xs text-muted">
                    {fecha(m.movDate)}
                    {m.reference && (
                      <span className="ml-1 inline-flex items-center gap-1 text-royal">
                        <ShieldCheck size={11} /> {m.reference}
                      </span>
                    )}
                  </p>
                </div>
                <p className={`flex-none font-sans font-bold ${m.movType === 'aporte' ? 'text-ok' : 'text-warn'}`}>
                  {m.movType === 'aporte' ? '+' : '−'}
                  {fmt(m.amount)}
                </p>
                {canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    title="Eliminar movimiento"
                    onClick={() => {
                      if (!window.confirm(`¿Eliminar "${m.description}"? El saldo del fondo se recalcula.`)) return;
                      enTransicion(startTransition, async () => {
                        const r = await deleteMovementAction(m.id, condominiumId);
                        if (r.ok) toast.success('Movimiento eliminado.');
                        else toast.error(r.error);
                      });
                    }}
                    className="flex-none text-muted transition hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>

      {showFund && <FundModal condominiumId={condominiumId} fund={fund} onDone={() => setShowFund(false)} />}
      {movType && (
        <MovementModal
          condominiumId={condominiumId}
          fundId={fund.id}
          movType={movType}
          onDone={() => setMovType(null)}
        />
      )}
    </div>
  );
}
