'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { openVoteAction, closeVoteAction, publishMinutesAction, type ActionState } from '../actions';

export function VoteControls({ topicId, assemblyId, voteStatus }: { topicId: string; assemblyId: string; voteStatus: string | null }) {
  if (voteStatus === 'cerrada') return null;
  if (voteStatus === 'abierta') {
    return (
      <form action={closeVoteAction.bind(null, topicId, assemblyId)} className="ml-auto">
        <button className="btn-ghost py-1 text-xs">Cerrar votación</button>
      </form>
    );
  }
  return (
    <form action={openVoteAction.bind(null, topicId, assemblyId)} className="ml-auto">
      <button className="btn-primary py-1 text-xs">Abrir votación</button>
    </form>
  );
}

export function MinutesForm({ assemblyId }: { assemblyId: string }) {
  const [state, formAction] = useFormState<ActionState, FormData>(publishMinutesAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <textarea name="minutesBody" rows={4} className="field-input" placeholder="Redacta el acta de la asamblea…" />
      {state.errors?.minutesBody && <p className="text-xs text-danger">{state.errors.minutesBody[0]}</p>}
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Publicando…' : 'Publicar acta'}
    </button>
  );
}
