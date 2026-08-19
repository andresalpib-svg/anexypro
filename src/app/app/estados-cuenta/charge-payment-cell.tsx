'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { applyChargePaymentAction, type ActionState } from './actions';

/**
 * La casilla de "aplicar pago" vive DENTRO de la línea del cobro, en
 * la columna "Pago" de su propio histórico — el monto que se escriba
 * acá se asigna a ESTE cargo (ver `applyChargePaymentAction` /
 * `makePayment`), nunca al más antiguo de la filial. Solo se renderiza
 * para líneas de cobro que todavía tienen saldo (`pendiente`/`parcial`)
 * — el llamador (`[propertyId]/page.tsx`) decide eso, no este
 * componente.
 */
export function ChargePaymentCell({
  condominiumId,
  propertyId,
  chargeId,
  owed,
}: {
  condominiumId: string;
  propertyId: string;
  chargeId: string;
  owed: number;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(applyChargePaymentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex min-w-[11rem] flex-col gap-1">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="chargeId" value={chargeId} />

      <div className="flex items-center gap-1">
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={owed > 0 ? owed : undefined}
          aria-label="Monto a aplicar a este cobro"
          className="field-input w-20 px-2 py-1 text-xs"
        />
        <select name="method" defaultValue="sinpe" aria-label="Método de pago" className="field-input px-1.5 py-1 text-xs">
          <option value="sinpe">SINPE</option>
          <option value="transferencia">Transf.</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="deposito">Depósito</option>
          <option value="comprobante">Comprob.</option>
        </select>
      </div>

      <input
        name="reference"
        placeholder="Referencia (opcional)"
        aria-label="Referencia del pago"
        className="field-input px-2 py-1 text-xs"
      />

      <div>
        <label className="field-label">Comprobante (opcional)</label>
        <input
          name="receipt"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          className="w-full text-[10px] text-muted file:mr-1 file:rounded file:border-0 file:bg-canvas file:px-1.5 file:py-0.5 file:text-[10px]"
        />
      </div>

      <SubmitButton />

      {state.formError && <p className="text-[11px] leading-tight text-danger">{state.formError}</p>}
      {state.success && <p className="text-[11px] text-ok">Pago aplicado.</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full px-2 py-1 text-[11px]">
      {pending ? 'Aplicando…' : 'Aplicar pago'}
    </button>
  );
}
