'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { makePaymentAction, type ActionState } from './actions';
import { StatusChip } from '@/components/ui/status-chip';

const TYPE_LABEL: Record<string, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  local: 'Local',
  lote: 'Lote',
  parqueo: 'Parqueo',
  bodega: 'Bodega',
};

export function PropertyBalanceRow({
  property,
  condominiumId,
  currency,
}: {
  property: {
    id: string;
    code: string;
    propertyType: string;
    balance: number;
    suspended: boolean;
    hasPaymentPlan: boolean;
    monthsOverdue: number;
  };
  condominiumId: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(makePaymentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-canvas">
        <td className="px-4 py-3 font-semibold text-ink">{property.code}</td>
        <td className="px-4 py-3 text-muted">{TYPE_LABEL[property.propertyType]}</td>
        <td className={`px-4 py-3 text-right font-semibold ${property.balance > 0 ? 'text-danger' : 'text-ok'}`}>
          {fmt(property.balance)}
        </td>
        <td className="px-4 py-3">
          {property.suspended ? (
            <StatusChip variant="danger">Suspendida ({property.monthsOverdue}m)</StatusChip>
          ) : property.hasPaymentPlan && property.balance > 0 ? (
            <StatusChip variant="royal">Convenio vigente</StatusChip>
          ) : property.balance > 0 ? (
            <StatusChip variant="warn">Saldo pendiente</StatusChip>
          ) : (
            <StatusChip variant="ok">Al día</StatusChip>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-ghost py-1.5 text-xs">
            {open ? 'Cerrar' : 'Registrar pago'}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-canvas px-4 py-3">
            <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="condominiumId" value={condominiumId} />
              <input type="hidden" name="propertyId" value={property.id} />
              <div>
                <label className="field-label">Monto</label>
                <input name="amount" type="number" step="0.01" className="field-input w-32" />
              </div>
              <div>
                <label className="field-label">Método</label>
                <select name="method" defaultValue="sinpe" className="field-input">
                  <option value="sinpe">SINPE Móvil</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="deposito">Depósito</option>
                  <option value="comprobante">Solo comprobante</option>
                </select>
              </div>
              <div>
                <label className="field-label">Referencia</label>
                <input name="reference" className="field-input w-32" />
              </div>
              <SubmitButton />
              {state.formError && <p className="text-xs text-danger">{state.formError}</p>}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Aplicando…' : 'Aplicar pago'}
    </button>
  );
}
