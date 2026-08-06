'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createAssemblyAction, type ActionState } from '../actions';

export default function NuevaAsambleaPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createAssemblyAction, {});

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="font-sans text-2xl font-bold text-ink">Nueva convocatoria</h1>
        <Link href="/app/asambleas" className="btn-ghost">
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>

      <form action={formAction} className="card space-y-4 p-6">
        <input type="hidden" name="condominiumId" value={searchParams.condoId ?? ''} />
        {state.formError && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">Título</label>
            <input name="title" className="field-input" placeholder="Asamblea Ordinaria Anual 2026" />
            {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
          </div>
          <div>
            <label className="field-label">Tipo</label>
            <select name="type" defaultValue="ordinaria" className="field-input">
              <option value="ordinaria">Ordinaria</option>
              <option value="extraordinaria">Extraordinaria</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="field-label">Fecha</label>
            <input name="eventDate" type="date" className="field-input" />
          </div>
          <div>
            <label className="field-label">Hora</label>
            <input name="eventTime" type="time" className="field-input" />
          </div>
          <div>
            <label className="field-label">Lugar</label>
            <input name="location" className="field-input" placeholder="Salón Social" />
          </div>
        </div>

        <div>
          <label className="field-label">Texto de la convocatoria</label>
          <textarea name="convocatoriaBody" rows={4} className="field-input" />
          {state.errors?.convocatoriaBody && <p className="mt-1 text-xs text-danger">{state.errors.convocatoriaBody[0]}</p>}
        </div>

        <div>
          <label className="field-label">Temas de agenda (uno por línea — todos llevan votación)</label>
          <textarea name="topics" rows={4} className="field-input" placeholder={'Aprobación de presupuesto 2027\nElección de junta directiva'} />
          {state.errors?.topics && <p className="mt-1 text-xs text-danger">{state.errors.topics[0]}</p>}
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Creando…' : 'Crear convocatoria'}
    </button>
  );
}
