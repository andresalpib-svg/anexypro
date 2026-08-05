'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createReservationAction, type ActionState } from './actions';

export function NewReservationForm({
  condominiumId,
  amenities,
  properties,
}: {
  condominiumId: string;
  amenities: { id: string; name: string }[];
  properties: { id: string; code: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createReservationAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (amenities.length === 0) {
    return <p className="text-sm text-muted">Crea al menos un área común para poder reservar.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={16} /> Nueva reserva
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Unidad</label>
        <select name="propertyId" className="field-input">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Área</label>
        <select name="amenityId" className="field-input">
          {amenities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Fecha</label>
        <input name="resDate" type="date" className="field-input" />
      </div>
      <div>
        <label className="field-label">De</label>
        <input name="startsAt" type="time" className="field-input w-24" />
      </div>
      <div>
        <label className="field-label">A</label>
        <input name="endsAt" type="time" className="field-input w-24" />
      </div>
      <div>
        <label className="field-label">Comprobante de pago (si el área tiene costo)</label>
        <input name="receipt" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="field-input w-56 text-xs" />
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancelar
      </button>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Reservando…' : 'Confirmar solicitud'}
    </button>
  );
}
