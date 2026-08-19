'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Wallet, Plus, Settings2, ShieldCheck, Ban, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { saveFundAction, addMovementAction, voidMovementAction, type ActionState } from './actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type FundBalanceView = { operativo: number; comprometido: number; invertido: number; total: number };

export type FundView = {
  id: string;
  type: string;
  name: string;
  targetAmount: number | null;
  monthlyQuota: number;
  accountCode: string;
  projectId: string | null;
  projectName: string | null;
  balance: FundBalanceView;
};

export type MovementView = {
  id: string;
  movType: string;
  amount: number;
  movDate: string;
  description: string;
  reference: string | null;
  investmentId: string | null;
  /** Anulado: sigue en la lista, marcado, pero no cuenta para el saldo. */
  voidedAt: string | null;
  voidReason: string | null;
};

export type AssetAccountOpt = { code: string; name: string };
export type ProjectOpt = { id: string; name: string };

const FUND_TYPE_LABEL: Record<string, string> = {
  operativo: 'Fondo operativo',
  reserva: 'Fondo de reserva',
  especial: 'Fondo especial',
  proyecto: 'Fondo para proyecto',
  otro: 'Otro fondo',
};

const MOV_TYPE_LABEL: Record<string, string> = {
  aporte: 'Aporte',
  uso: 'Uso',
  compromiso: 'Compromiso',
  liberacion: 'Liberación',
  inversion: 'Salida a inversión',
  retorno: 'Retorno de inversión',
};

// Los que puede elegir un usuario a mano — inversión/retorno los crea
// el sistema desde /app/finanzas/inversiones.
const USER_MOV_TYPES: { value: string; label: string }[] = [
  { value: 'aporte', label: 'Aporte' },
  { value: 'uso', label: 'Uso' },
  { value: 'compromiso', label: 'Comprometer' },
  { value: 'liberacion', label: 'Liberar compromiso' },
];

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
  assetAccounts,
  projects,
  onDone,
}: {
  condominiumId: string;
  fund: FundView | null;
  assetAccounts: AssetAccountOpt[];
  projects: ProjectOpt[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveFundAction, {});
  const [type, setType] = useState(fund?.type ?? 'operativo');
  useEffect(() => {
    if (state.success) {
      toast.success('Fondo guardado.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title={fund ? 'Configurar fondo' : 'Nuevo fondo'} onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        {fund && <input type="hidden" name="id" value={fund.id} />}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Tipo de fondo</label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="field-input"
            >
              {Object.entries(FUND_TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="field-label">Nombre</label>
            <input name="name" defaultValue={fund?.name ?? ''} placeholder="Ej: Fondo de emergencias" className="field-input" />
          </div>
        </div>
        {type === 'proyecto' && (
          <div>
            <label className="field-label">Proyecto</label>
            <select name="projectId" defaultValue={fund?.projectId ?? ''} className="field-input">
              <option value="">Sin ligar a un proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
            <label className="field-label">Cuota mensual (opcional)</label>
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
        <div>
          <label className="field-label">Cuenta contable espejo</label>
          <select name="accountCode" defaultValue={fund?.accountCode ?? ''} className="field-input">
            <option value="">Elegí la cuenta</option>
            {assetAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
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
  onDone,
}: {
  condominiumId: string;
  fundId: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(addMovementAction, {});
  const [movType, setMovType] = useState('aporte');
  useEffect(() => {
    if (state.success) {
      toast.success('Movimiento registrado.');
      onDone();
    }
  }, [state.success, onDone]);

  const necesitaRespaldo = movType === 'uso' || movType === 'compromiso';

  return (
    <Modal title="Nuevo movimiento" onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="fundId" value={fundId} />
        <div>
          <label className="field-label">Tipo</label>
          <select name="movType" value={movType} onChange={(e) => setMovType(e.target.value)} className="field-input">
            {USER_MOV_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
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
          <input name="description" className="field-input" placeholder="Ej: Aporte mensual de julio" />
        </div>
        <div>
          <label className="field-label">{necesitaRespaldo ? 'Acuerdo de asamblea que lo respalda' : 'Referencia (opcional)'}</label>
          <input name="reference" className="field-input" placeholder={necesitaRespaldo ? 'Acuerdo asamblea 04-2026' : ''} />
        </div>
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

function MovementsModal({
  condominiumId,
  fund,
  movements,
  canManage,
  onDone,
}: {
  condominiumId: string;
  fund: FundView;
  movements: MovementView[];
  canManage: boolean;
  onDone: () => void;
}) {
  const [showMov, setShowMov] = useState(false);
  const [pending, startTransition] = useTransition();
  const fmt = (n: number) => new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(n);

  return (
    <Modal title={`Movimientos — ${fund.name}`} subtitle={FUND_TYPE_LABEL[fund.type]} onClose={onDone} width="max-w-2xl">
      <div className="p-5">
        {canManage && (
          <button type="button" onClick={() => setShowMov(true)} className="btn-ghost mb-3 py-1.5 text-xs">
            <Plus size={13} /> Nuevo movimiento
          </button>
        )}
        <ul className="divide-y divide-line">
          {movements.length === 0 ? (
            <li className="p-8 text-center text-sm text-muted">Sin movimientos todavía.</li>
          ) : (
            movements.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium text-ink ${m.voidedAt ? 'line-through opacity-60' : ''}`}>
                    {m.description}
                    {m.investmentId && (
                      <span className="ml-2 inline-block">
                        <StatusChip variant="royal">{MOV_TYPE_LABEL[m.movType] ?? m.movType}</StatusChip>
                      </span>
                    )}
                    {m.voidedAt && (
                      <span className="ml-2 inline-block">
                        <StatusChip variant="danger">Anulado</StatusChip>
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {fecha(m.movDate)}
                    {m.reference && (
                      <span className="ml-1 inline-flex items-center gap-1 text-royal">
                        <ShieldCheck size={11} /> {m.reference}
                      </span>
                    )}
                    {m.voidReason && <span className="ml-1">· Anulado: {m.voidReason}</span>}
                  </p>
                </div>
                <p
                  className={`flex-none font-sans font-bold ${
                    m.voidedAt
                      ? 'text-muted line-through'
                      : m.movType === 'aporte' || m.movType === 'liberacion' || m.movType === 'retorno'
                        ? 'text-ok'
                        : 'text-warn'
                  }`}
                >
                  {m.movType === 'aporte' || m.movType === 'liberacion' || m.movType === 'retorno' ? '+' : '−'}
                  {fmt(m.amount)}
                </p>
                {canManage && !m.investmentId && !m.voidedAt && (
                  <button
                    type="button"
                    disabled={pending}
                    title="Anular movimiento"
                    onClick={() => {
                      // El movimiento no se borra: se anula y hay que
                      // decir por qué. Queda en la lista, tachado.
                      const motivo = window.prompt(
                        `Anular "${m.description}". El saldo del fondo se recalcula y el movimiento queda registrado como anulado.\n\n¿Por qué se anula?`
                      );
                      if (motivo === null) return;
                      if (motivo.trim().length < 5) {
                        toast.error('Escribí el motivo de la anulación (al menos 5 caracteres).');
                        return;
                      }
                      enTransicion(startTransition, async () => {
                        const r = await voidMovementAction(m.id, condominiumId, motivo);
                        if (r.ok) toast.success('Movimiento anulado.');
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
      {showMov && <MovementModal condominiumId={condominiumId} fundId={fund.id} onDone={() => setShowMov(false)} />}
    </Modal>
  );
}

function FundCard({
  fund,
  currency,
  canManage,
  onEdit,
  onViewMovements,
}: {
  fund: FundView;
  currency: string;
  canManage: boolean;
  onEdit: () => void;
  onViewMovements: () => void;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  const progress =
    fund.targetAmount && fund.targetAmount > 0 ? Math.min(1, fund.balance.total / fund.targetAmount) : null;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{FUND_TYPE_LABEL[fund.type]}</p>
          <p className="font-sans text-base font-bold text-ink">{fund.name}</p>
          {fund.projectName && <p className="text-xs text-muted">Proyecto: {fund.projectName}</p>}
        </div>
        {canManage && (
          <button type="button" onClick={onEdit} title="Configurar fondo" className="flex-none text-muted transition hover:text-royal">
            <Settings2 size={15} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[.68rem] uppercase tracking-wide text-muted">Operativo</p>
          <p className="font-sans text-lg font-bold text-ok">{fmt(fund.balance.operativo)}</p>
        </div>
        <div>
          <p className="text-[.68rem] uppercase tracking-wide text-muted">Comprometido</p>
          <p className="font-sans text-lg font-bold text-warn">{fmt(fund.balance.comprometido)}</p>
        </div>
        <div>
          <p className="text-[.68rem] uppercase tracking-wide text-muted">Invertido</p>
          <p className="font-sans text-lg font-bold text-royal">{fmt(fund.balance.invertido)}</p>
        </div>
        <div>
          <p className="text-[.68rem] uppercase tracking-wide text-muted">Total del fondo</p>
          <p className="font-sans text-lg font-bold text-ink">{fmt(fund.balance.total)}</p>
        </div>
      </div>

      {progress !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Meta {fmt(fund.targetAmount!)}</span>
            <span className="font-sans font-bold text-ink">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
            <div className="h-full rounded-full bg-royal" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      <button type="button" onClick={onViewMovements} className="btn-ghost mt-4 w-full justify-center py-2 text-xs">
        Ver movimientos
      </button>
    </div>
  );
}

export function FundsBoard({
  condominiumId,
  currency,
  canManage,
  funds,
  movementsByFund,
  assetAccounts,
  projects,
}: {
  condominiumId: string;
  currency: string;
  canManage: boolean;
  funds: FundView[];
  movementsByFund: Record<string, MovementView[]>;
  assetAccounts: AssetAccountOpt[];
  projects: ProjectOpt[];
}) {
  const [showFund, setShowFund] = useState(false);
  const [editFund, setEditFund] = useState<FundView | undefined>();
  const [viewFund, setViewFund] = useState<FundView | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          Fondos del condominio ({funds.length})
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditFund(undefined);
              setShowFund(true);
            }}
            className="btn-primary py-2 text-xs"
          >
            <Plus size={14} /> Nuevo fondo
          </button>
        )}
      </div>

      {funds.length === 0 ? (
        <div className="card p-10 text-center">
          <Wallet className="mx-auto mb-3 text-muted" size={26} />
          <p className="text-sm font-semibold text-ink">Este condominio no tiene fondos todavía</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
            Un fondo operativo, uno de reserva, o cualquier otro que la asamblea acuerde — cada uno lleva su
            propio saldo, separado del resto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1 lg:grid-cols-3">
          {funds.map((f) => (
            <FundCard
              key={f.id}
              fund={f}
              currency={currency}
              canManage={canManage}
              onEdit={() => {
                setEditFund(f);
                setShowFund(true);
              }}
              onViewMovements={() => setViewFund(f)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs leading-relaxed text-muted">
        <Landmark size={13} className="flex-none" />
        Operativo, comprometido e invertido son el MISMO dinero reclasificado — comprometer o invertir no cambia
        cuánto vale el fondo en total, solo cuánto de eso sigue libre para gastar hoy.
      </p>

      {showFund && (
        <FundModal
          condominiumId={condominiumId}
          fund={editFund ?? null}
          assetAccounts={assetAccounts}
          projects={projects}
          onDone={() => {
            setShowFund(false);
            setEditFund(undefined);
          }}
        />
      )}
      {viewFund && (
        <MovementsModal
          condominiumId={condominiumId}
          fund={viewFund}
          movements={movementsByFund[viewFund.id] ?? []}
          canManage={canManage}
          onDone={() => setViewFund(null)}
        />
      )}
    </div>
  );
}
