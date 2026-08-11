'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { CalendarPlus, CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { addCommunicationToCalendarAction, type ActionState } from './actions';

type LinkedEvent = { id: string; eventDate: string; eventTime: string | null; location: string | null };

/**
 * Vive en la pantalla de detalle del comunicado. Si ya tiene una
 * actividad vinculada la muestra; si no, ofrece crearla sin pedir de
 * nuevo título ni descripción — esos ya están en el comunicado.
 */
export function AddToCalendarForm({ communicationId, linkedEvent }: { communicationId: string; linkedEvent: LinkedEvent | null }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(addCommunicationToCalendarAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (linkedEvent) {
    return (
      <div className="card mt-4 flex items-center gap-3 p-4">
        <CalendarCheck size={18} className="shrink-0 text-ok" />
        <p className="text-sm text-ink">
          En el calendario para{' '}
          {new Date(linkedEvent.eventDate).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
          {linkedEvent.eventTime ? ` · ${linkedEvent.eventTime}` : ''}
          {linkedEvent.location ? ` · ${linkedEvent.location}` : ''}
        </p>
        <Link href="/app/calendario" className="btn-ghost ml-auto py-1 text-xs">
          Ver en calendario
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost mt-4">
        <CalendarPlus size={16} /> Agregar al calendario de residentes
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card mt-4 flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="communicationId" value={communicationId} />
      <div>
        <label className="field-label">Fecha de la actividad</label>
        <input name="eventDate" type="date" className="field-input" required />
        {state.errors?.eventDate && <p className="mt-1 text-xs text-danger">{state.errors.eventDate[0]}</p>}
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
        <label className="field-label">Audiencia del evento</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="condominos" defaultChecked /> Visible para los condóminos
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="interna" /> Solo interno (administración)
          </label>
        </div>
      </div>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
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
      {pending ? 'Agregando…' : 'Agregar al calendario'}
    </button>
  );
}
