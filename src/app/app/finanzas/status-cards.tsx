'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Building2, CheckCircle2, AlertTriangle, Download, Handshake, Ban, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';
import { suspendServicesAction, liftSuspensionAction } from './actions';
import { createPlanAction, type ActionState } from './cobranza/actions';

export type UnitStatusRow = {
  propertyId: string;
  code: string;
  ownerName: string | null;
  balance: number;
  monthsOverdue: number;
  hasPaymentPlan: boolean;
  suspended: boolean;
  manualSuspension: boolean;
};

/**
 * Los tres indicadores de Cuotas y pagos. "Al día" y "En morosidad"
 * abren el detalle por filial en una ventana sobrepuesta — con
 * descarga del reporte y, en morosidad, el arreglo de pago o la
 * suspensión de servicios al final de cada línea.
 */
export function FinanceStatusCards({
  condominiumId,
  currency,
  canManage,
  totalUnits,
  alDia,
  morosos,
}: {
  condominiumId: string;
  currency: string;
  /** Convenios y suspensiones son decisiones de la administración titular. */
  canManage: boolean;
  totalUnits: number;
  alDia: UnitStatusRow[];
  morosos: UnitStatusRow[];
}) {
  const [openList, setOpenList] = useState<null | 'aldia' | 'morosidad'>(null);
  const [planFor, setPlanFor] = useState<UnitStatusRow | null>(null);
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const exportHref = (estado: 'aldia' | 'morosidad') =>
    `/app/finanzas/exportar-estado?condoId=${condominiumId}&estado=${estado}`;

  const suspender = (row: UnitStatusRow) => {
    if (!window.confirm(`¿Suspender los servicios de ${row.code}? Se bloquean reservas, autorización de visitas y demás servicios hasta que la administración la levante.`)) return;
    enTransicion(startTransition, async () => {
      const r = await suspendServicesAction(row.propertyId, condominiumId);
      if (r.ok) toast.success(`Servicios de ${row.code} suspendidos.`);
      else toast.error(r.error);
    });
  };

  const levantar = (row: UnitStatusRow) => {
    const reason = window.prompt(`¿Por qué se levanta la suspensión de ${row.code}? (opcional)`) ?? undefined;
    enTransicion(startTransition, async () => {
      const r = await liftSuspensionAction(row.propertyId, condominiumId, reason || undefined);
      if (r.ok) toast.success(`Suspensión de ${row.code} levantada.`);
      else toast.error(r.error);
    });
  };

  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card icon={Building2} color="bg-royal" label="Unidades" value={totalUnits} />
        <Card
          icon={CheckCircle2}
          color="bg-ok"
          label="Al día"
          value={alDia.length}
          onClick={() => setOpenList('aldia')}
        />
        <Card
          icon={AlertTriangle}
          color="bg-danger"
          label="En morosidad"
          value={morosos.length}
          onClick={() => setOpenList('morosidad')}
        />
      </div>

      {openList === 'aldia' && (
        <Modal
          title="Filiales al día"
          subtitle={`${alDia.length} filial(es) sin saldo pendiente`}
          onClose={() => setOpenList(null)}
          width="max-w-2xl"
        >
          <div className="p-5">
            <DownloadButton href={exportHref('aldia')} />
            <table className="mt-3 w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">N.º de casa</th>
                  <th className="px-4 py-3">Propietario</th>
                </tr>
              </thead>
              <tbody>
                {alDia.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-muted">
                      Ninguna filial está al día en este condominio.
                    </td>
                  </tr>
                ) : (
                  alDia.map((p) => (
                    <tr key={p.propertyId} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-semibold text-ink">{p.code}</td>
                      <td className="px-4 py-3 text-ink">{p.ownerName ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {openList === 'morosidad' && (
        <Modal
          title="Filiales en morosidad"
          subtitle={`${morosos.length} filial(es) con saldo pendiente`}
          onClose={() => setOpenList(null)}
          width="max-w-4xl"
        >
          <div className="p-5">
            <DownloadButton href={exportHref('morosidad')} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">N.º de casa</th>
                    <th className="px-4 py-3">Propietario</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3">Estado</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {morosos.length === 0 ? (
                    <tr>
                      <td colSpan={canManage ? 5 : 4} className="px-4 py-10 text-center text-muted">
                        No hay filiales en morosidad. 🎉
                      </td>
                    </tr>
                  ) : (
                    morosos.map((p) => (
                      <tr key={p.propertyId} className="border-b border-line last:border-0 align-top">
                        <td className="px-4 py-3 font-semibold text-ink">{p.code}</td>
                        <td className="px-4 py-3 text-ink">{p.ownerName ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-danger">{fmt(p.balance)}</td>
                        <td className="px-4 py-3">
                          {p.suspended ? (
                            <StatusChip variant="danger">
                              {p.manualSuspension ? 'Suspendida (manual)' : `Suspendida (${p.monthsOverdue}m)`}
                            </StatusChip>
                          ) : p.hasPaymentPlan ? (
                            <StatusChip variant="royal">Convenio vigente</StatusChip>
                          ) : (
                            <StatusChip variant="warn">
                              {p.monthsOverdue > 0 ? `${p.monthsOverdue} cuota(s) vencida(s)` : 'Saldo pendiente'}
                            </StatusChip>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2 whitespace-nowrap">
                              {!p.hasPaymentPlan && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => setPlanFor(p)}
                                  title="Registrar un arreglo (convenio) de pago"
                                  className="inline-flex items-center gap-1 rounded-lg border border-royal/40 px-2 py-1 text-[.7rem] font-semibold text-royal transition hover:bg-royal-soft"
                                >
                                  <Handshake size={12} /> Arreglo de pago
                                </button>
                              )}
                              {p.manualSuspension ? (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => levantar(p)}
                                  title="Levantar la suspensión manual"
                                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[.7rem] font-semibold text-muted transition hover:bg-canvas hover:text-ink"
                                >
                                  <Undo2 size={12} /> Levantar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => suspender(p)}
                                  title="Suspender servicios (reservas, visitas…)"
                                  className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-[.7rem] font-semibold text-danger transition hover:bg-danger/10"
                                >
                                  <Ban size={12} /> Suspender
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {canManage && (
              <p className="mt-3 text-[.7rem] leading-relaxed text-muted">
                El arreglo de pago crea un convenio: mientras esté vigente la filial no devenga interés
                moratorio ni se suspende por la regla automática. La gestión completa de cobranza vive en
                la pestaña Cobranza.
              </p>
            )}
          </div>

          {planFor && (
            <ConvenioModal
              condominiumId={condominiumId}
              row={planFor}
              currency={currency}
              onDone={() => setPlanFor(null)}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function Card({
  icon: Icon,
  color,
  label,
  value,
  onClick,
}: {
  icon: typeof Building2;
  color: string;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${color}`}>
        <Icon size={20} />
      </span>
      <p className="mt-3 font-sans text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-sm font-medium text-muted">{label}</p>
    </>
  );
  if (!onClick) return <div className="card p-5">{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-royal/40 hover:shadow-md"
    >
      {body}
      <p className="mt-1 text-[.7rem] font-semibold text-royal">Ver detalle →</p>
    </button>
  );
}

function DownloadButton({ href }: { href: string }) {
  return (
    <a href={href} className="btn-ghost inline-flex items-center gap-1.5 py-1.5 text-xs" download>
      <Download size={13} /> Descargar reporte
    </a>
  );
}

/**
 * Arreglo de pago desde la lista de morosidad — mismo servicio y la
 * misma server action que la pestaña Cobranza, con la filial fija.
 */
function ConvenioModal({
  condominiumId,
  row,
  currency,
  onDone,
}: {
  condominiumId: string;
  row: UnitStatusRow;
  currency: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createPlanAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Arreglo de pago registrado. La filial deja de devengar intereses mientras esté vigente.');
      onDone();
    }
  }, [state.success, onDone]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <Modal
      title={`Arreglo de pago — ${row.code}`}
      subtitle={`${row.ownerName ?? 'Sin propietario registrado'} · debe ${fmt(row.balance)}`}
      onClose={onDone}
      width="max-w-xl"
    >
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="propertyId" value={row.propertyId} />
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Deuda total</label>
            <input name="totalDebt" type="number" step="0.01" min="0" defaultValue={row.balance} className="field-input w-40" />
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
        {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
        {state.errors &&
          Object.values(state.errors).map((m, i) => (
            <p key={i} className="text-xs font-medium text-danger">
              {m?.[0]}
            </p>
          ))}
        <div className="flex gap-2 pt-1">
          <SubmitPlan />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SubmitPlan() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : 'Registrar arreglo'}
    </button>
  );
}
