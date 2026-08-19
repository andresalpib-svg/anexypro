'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { sendStatementEmailAction, type ActionState } from './actions';

/**
 * El destinatario se prellena con el correo del propietario vigente,
 * pero SIEMPRE queda editable: quien envía confirma a quién le está
 * mandando el estado de cuenta de ESTA filial antes de que salga,
 * nunca se dispara solo.
 */
export function SendStatementForm({
  condominiumId,
  propertyId,
  defaultTo,
}: {
  condominiumId: string;
  propertyId: string;
  defaultTo: string | null;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(sendStatementEmailAction, {});
  const [to, setTo] = useState(defaultTo ?? '');

  useEffect(() => {
    if (state.success) {
      // El campo se deja tal cual (no se limpia): es común reenviar al
      // mismo destinatario o a uno adicional un rato después.
    }
  }, [state.success]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div>
        <label className="field-label">Correo destinatario</label>
        <input
          name="to"
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="correo@ejemplo.com"
          className="field-input w-full"
        />
        {!defaultTo && (
          <p className="mt-1 text-xs text-muted">Esta filial no tiene un propietario con correo registrado — escribilo a mano.</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state.formError && <p className="text-xs text-danger">{state.formError}</p>}
        {state.success && <p className="text-xs text-ok">Estado de cuenta enviado.</p>}
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Enviando…' : 'Enviar estado de cuenta'}
    </button>
  );
}
