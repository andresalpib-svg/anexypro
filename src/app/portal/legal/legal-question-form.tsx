'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { askLegalAction, type LegalState } from './actions';

export function LegalQuestionForm() {
  const [state, formAction] = useFormState<LegalState, FormData>(askLegalAction, {});

  return (
    <div>
      <form action={formAction} className="card flex items-end gap-3 p-4">
        <div className="flex-1">
          <label className="field-label">Tu consulta</label>
          <input name="question" placeholder="¿Puedo tener una mascota en mi apartamento?" className="field-input" />
        </div>
        <SubmitButton />
      </form>
      {state.error && <p className="mt-2 text-sm text-danger">{state.error}</p>}
      {state.answer && (
        <div className="card mt-3 flex items-start gap-3 p-5">
          <Sparkles size={18} className="mt-0.5 flex-none text-lumen" />
          <div>
            <p className="whitespace-pre-wrap text-sm text-ink">{state.answer.answer}</p>
            {!state.answer.grounded && <p className="mt-2 text-xs text-muted">Esta respuesta no está fundamentada en el reglamento — ver el motivo arriba.</p>}
          </div>
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
