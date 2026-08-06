'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Unlock, CreditCard, CalendarClock, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import {
  assignPlanAction,
  registerPaymentAction,
  blockCompanyAction,
  unblockCompanyAction,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type Fila = {
  companyId: string;
  companyName: string;
  planId: string | null;
  planName: string | null;
  price: number;
  currency: string;
  period: string;
  maxCondominiums: number;
  condominiums: number;
  nextPaymentDate: string | null;
  lastPaymentAt: string | null;
  status: string;
  label: string;
  detail: string;
  action: string;
  blockReason: string | null;
};

export type PlanSimple = {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  maxCondominiums: number;
  isActive: boolean;
};

const VARIANTE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  al_dia: 'ok',
  por_vencer: 'warn',
  en_gracia: 'warn',
  en_mora: 'danger',
  bloqueada: 'danger',
  sin_plan: 'neutral',
};

const money = (n: number, c: string) =>
  `${c} ${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SubscriptionTable({ suscripciones, planes }: { suscripciones: Fila[]; planes: PlanSimple[] }) {
  const [pago, setPago] = useState<Fila | null>(null);
  const [bloqueo, setBloqueo] = useState<Fila | null>(null);
  const [plan, setPlan] = useState<Fila | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function desbloquear(f: Fila) {
    enTransicion(start, async () => {
      const r = await unblockCompanyAction(f.companyId);
      if (!r.ok) setError(r.error ?? 'No se pudo desbloquear.');
      router.refresh();
    });
  }

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="card mb-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Condominios</th>
              <th className="px-4 py-3">Próximo pago</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {suscripciones.map((f) => (
              <tr key={f.companyId} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="block font-semibold text-ink">{f.companyName}</span>
                  {f.lastPaymentAt && (
                    <span className="text-xs text-muted">
                      último pago {new Date(f.lastPaymentAt).toLocaleDateString('es-CR')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {f.planName ? (
                    <>
                      <span className="block text-ink">{f.planName}</span>
                      <span className="text-xs">
                        {money(f.price, f.currency)} · {f.period}
                      </span>
                    </>
                  ) : (
                    <span className="text-warn">Sin plan</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {f.condominiums}
                  {f.maxCondominiums > 0 ? ` de ${f.maxCondominiums}` : ' (sin tope)'}
                  {f.maxCondominiums > 0 && f.condominiums >= f.maxCondominiums && (
                    <span className="ml-1 text-warn" title="Alcanzó el tope de su plan">
                      <AlertTriangle size={12} className="inline" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">
                  {f.nextPaymentDate ? new Date(`${f.nextPaymentDate}T00:00:00`).toLocaleDateString('es-CR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusChip variant={VARIANTE[f.status] ?? 'neutral'}>{f.label}</StatusChip>
                  <span className="mt-1 block max-w-[24rem] text-xs text-muted">{f.detail}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setPlan(f)}
                      title="Asignar o cambiar el plan"
                      className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                    >
                      <CalendarClock size={15} />
                    </button>
                    {f.planId && (
                      <button
                        type="button"
                        onClick={() => setPago(f)}
                        title="Registrar un pago"
                        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-royal"
                      >
                        <CreditCard size={15} />
                      </button>
                    )}
                    {f.status === 'bloqueada' ? (
                      <button
                        type="button"
                        onClick={() => desbloquear(f)}
                        title="Restablecer el acceso"
                        className="rounded-lg p-1.5 text-muted hover:bg-ok-bg hover:text-ok"
                      >
                        <Unlock size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBloqueo(f)}
                        title="Bloquear el acceso"
                        className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                      >
                        <Ban size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pago && <PagoModal fila={pago} onClose={() => { setPago(null); router.refresh(); }} />}
      {bloqueo && <BloqueoModal fila={bloqueo} onClose={() => { setBloqueo(null); router.refresh(); }} />}
      {plan && (
        <PlanModal fila={plan} planes={planes} onClose={() => { setPlan(null); router.refresh(); }} />
      )}
    </>
  );
}

function PagoModal({ fila, onClose }: { fila: Fila; onClose: () => void }) {
  const [monto, setMonto] = useState(String(fila.price));
  const [metodo, setMetodo] = useState('Transferencia');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [enviando, start] = useTransition();

  return (
    <Modal title={`Registrar pago — ${fila.companyName}`} onClose={onClose}>
      {hasta ? (
        <div>
          <p className="rounded-xl bg-ok-bg/60 px-4 py-3 text-sm text-ink">
            Pago registrado. El próximo vence el {new Date(`${hasta}T00:00:00`).toLocaleDateString('es-CR')}.
            {fila.status === 'bloqueada' && ' El acceso quedó restablecido.'}
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className="btn-primary">
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Se registra el pago del período en curso y la fecha del próximo se corre según la
            periodicidad del plan. Si la empresa estaba bloqueada, el acceso se restablece.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Monto</span>
            <input value={monto} onChange={(e) => setMonto(e.target.value)} className="field-input w-full" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Medio de pago</span>
            <input value={metodo} onChange={(e) => setMetodo(e.target.value)} className="field-input w-full" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Referencia</span>
            <input value={ref} onChange={(e) => setRef(e.target.value)} className="field-input w-full" />
          </label>

          {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() =>
                enTransicion(start, async () => {
                  const r = await registerPaymentAction(fila.companyId, {
                    amount: Number(monto) || undefined,
                    method: metodo,
                    reference: ref,
                  });
                  if (!r.ok) setError(r.error ?? 'No se pudo registrar.');
                  else setHasta(r.periodEnd ?? null);
                })
              }
              className="btn-primary"
            >
              {enviando ? 'Registrando…' : 'Registrar pago'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BloqueoModal({ fila, onClose }: { fila: Fila; onClose: () => void }) {
  const [motivo, setMotivo] = useState(
    fila.status === 'en_mora' ? 'Suscripción vencida: se agotó el plazo de pago.' : ''
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, start] = useTransition();

  return (
    <Modal title={`Bloquear el acceso — ${fila.companyName}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-xl bg-warn-bg/50 px-4 py-3 text-sm text-ink">
          <p className="font-semibold">Qué pasa al bloquear</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            <li>El administrador entra, pero solo ve la pantalla de suscripción vencida.</li>
            <li>Los supervisores y el contador no pueden ingresar.</li>
            <li>Los residentes consultan su información, pero no autorizan visitas ni reservan.</li>
            <li>La caseta de seguridad sigue funcionando.</li>
            <li className="font-semibold">
              No se elimina ninguna información: todo vuelve al desbloquear.
            </li>
          </ul>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            className="field-input w-full"
          />
        </label>

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              enTransicion(start, async () => {
                const r = await blockCompanyAction(fila.companyId, motivo);
                if (!r.ok) setError(r.error ?? 'No se pudo bloquear.');
                else onClose();
              })
            }
            className="btn-primary !bg-danger"
          >
            {enviando ? 'Bloqueando…' : 'Bloquear acceso'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PlanModal({
  fila,
  planes,
  onClose,
}: {
  fila: Fila;
  planes: PlanSimple[];
  onClose: () => void;
}) {
  const [planId, setPlanId] = useState(fila.planId ?? '');
  const [fecha, setFecha] = useState(fila.nextPaymentDate ?? new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [enviando, start] = useTransition();

  const elegido = planes.find((p) => p.id === planId);

  return (
    <Modal title={`Plan de ${fila.companyName}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Plan</span>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="field-input w-full">
            <option value="">Elegí un plan…</option>
            {planes
              .filter((p) => p.isActive || p.id === fila.planId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.price, p.currency)} {p.period}
                  {p.maxCondominiums > 0 ? ` · hasta ${p.maxCondominiums} condominios` : ' · sin tope'}
                </option>
              ))}
          </select>
        </label>

        {elegido && elegido.maxCondominiums > 0 && fila.condominiums > elegido.maxCondominiums && (
          <p className="rounded-lg bg-warn-bg/60 px-3 py-2 text-xs text-ink">
            Esta empresa ya tiene {fila.condominiums} condominios y el plan permite {elegido.maxCondominiums}.
            Los existentes se conservan; no podrá crear más hasta ampliar el plan.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Próxima fecha de pago</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="field-input w-full" />
        </label>

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() =>
              enTransicion(start, async () => {
                const r = await assignPlanAction(fila.companyId, planId, fecha);
                if (!r.ok) setError(r.error ?? 'No se pudo asignar.');
                else onClose();
              })
            }
            className="btn-primary"
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
