'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createMyReservationAction, type ActionState } from './actions';

export function NewReservationForm({ condominiumId, amenities }: { condominiumId: string; amenities: { id: string; name: string; reservationCost: string }[] }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createMyReservationAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [amenityId, setAmenityId] = useState(amenities[0]?.id ?? '');
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (amenities.length === 0) return <p className="text-sm text-muted">Tu administración todavía no ha configurado áreas comunes reservables.</p>;

  const selected = amenities.find((a) => a.id === amenityId);
  const hasCost = Number(selected?.reservationCost ?? 0) > 0;

  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Área</label>
        <select name="amenityId" className="field-input" value={amenityId} onChange={(e) => setAmenityId(e.target.value)}>
          {amenities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {Number(a.reservationCost) > 0 ? ` · ${a.reservationCost}` : ''}
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
      {hasCost && (
        <div>
          <label className="field-label">Comprobante de pago (obligatorio)</label>
          <input name="receipt" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" required className="field-input" />
        </div>
      )}
      <SubmitButton />
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Reservando…' : 'Reservar'}
    </button>
  );
}
