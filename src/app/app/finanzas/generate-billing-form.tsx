'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Zap } from 'lucide-react';
import { generateBillingAction, type ActionState } from './actions';

export function GenerateBillingForm({ condominiumId }: { condominiumId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(generateBillingAction, {});
  const thisMonth = new Date().toISOString().slice(0, 7);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label" htmlFor="period">
          Período a facturar
        </label>
        <input id="period" name="period" type="month" defaultValue={thisMonth} className="field-input" />
      </div>
      <SubmitButton />
      {state.success && <p className="text-xs font-medium text-ok">Corrida generada correctamente.</p>}
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      <Zap size={15} /> {pending ? 'Generando…' : 'Generar cuotas ordinarias'}
    </button>
  );
}
