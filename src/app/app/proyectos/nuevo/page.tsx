'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createProjectAction, type ActionState } from '../actions';

export default function NuevoProyectoPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createProjectAction, {});

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <h1 className="font-sans text-2xl font-bold text-ink">Nuevo proyecto</h1>
        <Link href="/app/proyectos" className="btn-ghost">
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>

      <form action={formAction} className="card space-y-4 p-6">
        <input type="hidden" name="condominiumId" value={searchParams.condoId ?? ''} />
        {state.formError && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>}
        <div>
          <label className="field-label">Nombre</label>
          <input name="name" className="field-input" placeholder="Impermeabilización de techos" />
          {state.errors?.name && <p className="mt-1 text-xs text-danger">{state.errors.name[0]}</p>}
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <textarea name="description" rows={3} className="field-input" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Presupuesto</label>
            <input name="budget" type="number" step="0.01" defaultValue="0" className="field-input" />
          </div>
          <div>
            <label className="field-label">Inicio</label>
            <input name="startDate" type="date" className="field-input" />
          </div>
          <div>
            <label className="field-label">Fin estimado</label>
            <input name="endDate" type="date" className="field-input" />
          </div>
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
      {pending ? 'Creando…' : 'Crear proyecto'}
    </button>
  );
}
