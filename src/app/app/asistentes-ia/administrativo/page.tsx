'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { askAdminAssistantAction, type AdminAssistantState } from './actions';

export default function AdministrativeAssistantPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const [state, formAction] = useFormState<AdminAssistantState, FormData>(askAdminAssistantAction, {});

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-sans text-2xl font-bold text-ink">Asistente Administrativo</h1>
        <p className="mt-1 text-sm text-muted">Pregunta sobre el estado actual de tu condominio — respuestas fundamentadas en datos reales, no genéricas.</p>
      </div>

      <form action={formAction} className="card flex items-end gap-3 p-4">
        <input type="hidden" name="condominiumId" value={searchParams.condoId ?? ''} />
        <div className="flex-1">
          <label className="field-label">Tu pregunta</label>
          <input name="question" placeholder="¿Cuántas unidades están en morosidad?" className="field-input" />
        </div>
        <SubmitButton />
      </form>

      {state.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
      {state.answer && (
        <div className="card mt-3 flex items-start gap-3 p-5">
          <Sparkles size={18} className="mt-0.5 flex-none text-lumen" />
          <p className="whitespace-pre-wrap text-sm text-ink">{state.answer}</p>
        </div>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ia">
      {pending ? 'Consultando…' : 'Preguntar'}
    </button>
  );
}
