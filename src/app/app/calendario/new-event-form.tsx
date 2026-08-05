'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createEventAction, type ActionState } from './actions';

const TYPE_OPTIONS = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'asamblea', label: 'Asamblea' },
  { value: 'reserva', label: 'Reserva' },
  { value: 'corte_servicio', label: 'Corte de servicio' },
  { value: 'actividad', label: 'Actividad' },
  { value: 'otro', label: 'Otro' },
];

export function NewEventForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createEventAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={16} /> Nuevo evento
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Título</label>
        <input name="title" className="field-input w-48" />
        {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
      </div>
      <div>
        <label className="field-label">Tipo</label>
        <select name="eventType" defaultValue="actividad" className="field-input">
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Fecha</label>
        <input name="eventDate" type="date" className="field-input" />
      </div>
      <div>
        <label className="field-label">Hora (opcional)</label>
        <input name="eventTime" type="time" className="field-input" />
      </div>
      <div>
        <label className="field-label">Lugar (opcional)</label>
        <input name="location" placeholder="Rancho, salón, portón…" className="field-input w-40" />
      </div>
      <div className="w-full">
        <label className="field-label">Descripción / detalle del evento</label>
        <textarea name="description" rows={2} placeholder="Lo que el residente verá al abrir el evento" className="field-input" />
      </div>
      <div className="w-full">
        <label className="field-label">Audiencia</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="condominos" defaultChecked /> Evento para los condóminos
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="interna" /> Evento interno de la administración
          </label>
        </div>
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancelar
      </button>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}
