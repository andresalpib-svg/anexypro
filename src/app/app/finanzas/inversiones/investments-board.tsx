'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Landmark, Plus, Coins, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  createInvestmentAction,
  closeInvestmentAction,
  recordInterestAction,
  type ActionState,
} from './actions';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type FundOpt = { id: string; name: string; operativo: number };
export type BankOpt = { id: string; name: string };

export type InvestmentRow = {
  id: string;
  institution: string;
  investmentType: string;
  amount: number;
  startDate: string;
  maturityDate: string | null;
  rate: number;
  status: string;
  fundName: string;
  bankAccountName: string | null;
  totalInterest: number;
};

const TYPE_LABEL: Record<string, string> = {
  plazo_fijo: 'Certificado a plazo (CDP)',
  fondo_inversion: 'Fondo de inversión',
  bono: 'Bono',
  certificado: 'Certificado de depósito',
  otro: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  activa: 'Activa',
  vencida: 'Vencida',
  liquidada: 'Liquidada',
  cancelada: 'Cancelada',
};

const STATUS_VARIANT: Record<string, 'ok' | 'warn' | 'royal' | 'neutral'> = {
  activa: 'ok',
  vencida: 'warn',
  liquidada: 'royal',
  cancelada: 'neutral',
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

function NewInvestmentModal({
  condominiumId,
  currency,
  funds,
  banks,
  onDone,
}: {
  condominiumId: string;
  currency: string;
  funds: FundOpt[];
  banks: BankOpt[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createInvestmentAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Inversión registrada.');
      onDone();
    }
  }, [state.success, onDone]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <Modal title="Nueva inversión" subtitle="El monto sale del fondo de origen — no puede superar lo operativo" onClose={onDone} width="max-w-2xl">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Fondo de origen</label>
            <select name="fundId" defaultValue="" className="field-input">
              <option value="">Elegí el fondo</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (operativo {fmt(f.operativo)})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="field-label">Institución</label>
            <input name="institution" className="field-input" placeholder="Ej: Banco Nacional, Popular Fondos…" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <label className="field-label">Tipo de inversión</label>
            <select name="investmentType" defaultValue="plazo_fijo" className="field-input">
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Tasa anual %</label>
            <input name="rate" type="number" step="0.01" min="0" className="field-input w-28" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Fecha inicial</label>
            <input name="startDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Vencimiento (opcional)</label>
            <input name="maturityDate" type="date" className="field-input w-40" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="field-label">Cuenta bancaria de origen (opcional)</label>
            <select name="bankAccountId" defaultValue="" className="field-input">
              <option value="">Sin especificar</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label">Documento (opcional)</label>
          <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="field-input text-xs" />
        </div>
        <div>
          <label className="field-label">Notas (opcional)</label>
          <textarea name="notes" rows={2} className="field-input" />
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Registrar inversión" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InterestModal({
  condominiumId,
  investment,
  currency,
  onDone,
}: {
  condominiumId: string;
  investment: InvestmentRow;
  currency: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(recordInterestAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Interés registrado como ingreso financiero.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title={`Registrar interés — ${investment.institution}`} onClose={onDone} width="max-w-md">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="investmentId" value={investment.id} />
        <p className="rounded-lg bg-royal-soft px-3 py-2 text-xs leading-relaxed text-ink">
          Se registra como INGRESO FINANCIERO (cuenta 4902), nunca como cuota condominal — se acredita de vuelta
          al fondo "{investment.fundName}".
        </p>
        <div className="flex gap-3">
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Fecha</label>
            <input name="date" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Registrar" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CloseModal({
  condominiumId,
  investment,
  currency,
  onDone,
}: {
  condominiumId: string;
  investment: InvestmentRow;
  currency: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(closeInvestmentAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Inversión cerrada. El principal vuelve al fondo de origen.');
      onDone();
    }
  }, [state.success, onDone]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <Modal title={`Cerrar inversión — ${investment.institution}`} onClose={onDone} width="max-w-md">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="investmentId" value={investment.id} />
        <div>
          <label className="field-label">Estado final</label>
          <select name="status" defaultValue="liquidada" className="field-input">
            <option value="liquidada">Liquidada</option>
            <option value="vencida">Vencida (llegó a su plazo)</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
        <div className="flex gap-3">
          <div>
            <label className="field-label">Fecha de cierre</label>
            <input name="closeDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Monto que vuelve al fondo</label>
            <input
              name="returnAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={investment.amount}
              className="field-input w-40"
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Por defecto se devuelve el principal completo ({fmt(investment.amount)}). Ajustalo solo si hubo una
          liquidación anticipada con penalización.
        </p>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Cerrar inversión" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function InvestmentsBoard({
  condominiumId,
  currency,
  canManage,
  investments,
  funds,
  banks,
}: {
  condominiumId: string;
  currency: string;
  canManage: boolean;
  investments: InvestmentRow[];
  funds: FundOpt[];
  banks: BankOpt[];
}) {
  const [showNew, setShowNew] = useState(false);
  const [interestFor, setInterestFor] = useState<InvestmentRow | null>(null);
  const [closeFor, setCloseFor] = useState<InvestmentRow | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Inversiones ({investments.length})</p>
        {canManage && (
          <button type="button" onClick={() => setShowNew(true)} className="btn-primary py-2 text-xs">
            <Plus size={14} /> Nueva inversión
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Institución</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fondo</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Tasa</th>
                <th className="px-4 py-3">Inicio</th>
                <th className="px-4 py-3">Vencimiento</th>
                <th className="px-4 py-3 text-right">Intereses</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {investments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted">
                    <Landmark className="mx-auto mb-2" size={22} />
                    Sin inversiones registradas todavía.
                  </td>
                </tr>
              ) : (
                investments.map((inv) => (
                  <tr key={inv.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{inv.institution}</td>
                    <td className="px-4 py-3 text-muted">{TYPE_LABEL[inv.investmentType] ?? inv.investmentType}</td>
                    <td className="px-4 py-3 text-muted">{inv.fundName}</td>
                    <td className="px-4 py-3 text-right font-sans font-bold text-ink">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3 text-right text-muted">{inv.rate}%</td>
                    <td className="px-4 py-3 text-muted">{fecha(inv.startDate)}</td>
                    <td className="px-4 py-3 text-muted">{inv.maturityDate ? fecha(inv.maturityDate) : '—'}</td>
                    <td className="px-4 py-3 text-right text-ok">{inv.totalInterest > 0 ? fmt(inv.totalInterest) : '—'}</td>
                    <td className="px-4 py-3">
                      <StatusChip variant={STATUS_VARIANT[inv.status] ?? 'neutral'}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </StatusChip>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && inv.status === 'activa' && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            title="Registrar interés"
                            onClick={() => setInterestFor(inv)}
                            className="text-royal transition hover:opacity-70"
                          >
                            <Coins size={15} />
                          </button>
                          <button
                            type="button"
                            title="Liquidar / cerrar"
                            onClick={() => setCloseFor(inv)}
                            className="text-muted transition hover:text-royal"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && (
        <NewInvestmentModal
          condominiumId={condominiumId}
          currency={currency}
          funds={funds}
          banks={banks}
          onDone={() => setShowNew(false)}
        />
      )}
      {interestFor && (
        <InterestModal
          condominiumId={condominiumId}
          investment={interestFor}
          currency={currency}
          onDone={() => setInterestFor(null)}
        />
      )}
      {closeFor && (
        <CloseModal
          condominiumId={condominiumId}
          investment={closeFor}
          currency={currency}
          onDone={() => setCloseFor(null)}
        />
      )}
    </div>
  );
}
