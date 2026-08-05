'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createAmenityAction, type ActionState } from './actions';

export function NewAmenityForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createAmenityAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
        <Plus size={14} /> Nueva área
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Nombre</label>
        <input name="name" placeholder="Salón Social" className="field-input w-40" />
      </div>
      <div>
        <label className="field-label">Capacidad</label>
        <input name="capacity" type="number" className="field-input w-20" />
      </div>
      <div>
        <label className="field-label">Costo</label>
        <input name="reservationCost" type="number" step="0.01" defaultValue="0" className="field-input w-24" />
      </div>
      <div>
        <label className="field-label">Normativa de uso (PDF/imagen)</label>
        <input name="rulesFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="field-input w-52 text-xs" />
      </div>
      <div>
        <label className="field-label">Imagen de portada</label>
        <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-52 text-xs" />
      </div>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-ink">
        <input type="checkbox" name="requiresApproval" value="true" /> Requiere aprobación
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-xs text-ink" title="Una reserva vigente bloquea el día completo">
        <input type="checkbox" name="exclusivePerDay" defaultChecked /> Exclusiva por día
      </label>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
        Cancelar
      </button>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}
