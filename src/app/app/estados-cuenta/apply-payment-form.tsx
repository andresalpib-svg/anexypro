'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { applyStatementPaymentAction, type ActionState } from './actions';

export function ApplyPaymentForm({ condominiumId, propertyId }: { condominiumId: string; propertyId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(applyStatementPaymentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="propertyId" value={propertyId} />
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
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
      {state.success && <p className="w-full text-xs text-ok">Pago aplicado.</p>}
    </form>
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
