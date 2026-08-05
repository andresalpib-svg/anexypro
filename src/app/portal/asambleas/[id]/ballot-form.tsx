'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { castBallotAction, type BallotState } from '../actions';

export function BallotForm({ voteId, assemblyId }: { voteId: string; assemblyId: string }) {
  const [state, formAction] = useFormState<BallotState, FormData>(castBallotAction, {});

  if (state.success) {
    return <p className="text-sm font-medium text-ok">Tu voto quedó registrado. Gracias por participar.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="voteId" value={voteId} />
      <input type="hidden" name="assemblyId" value={assemblyId} />
      <SubmitChoice choice="a_favor" label="A favor" color="bg-ok" />
      <SubmitChoice choice="en_contra" label="En contra" color="bg-danger" />
      <SubmitChoice choice="abstencion" label="Abstención" color="bg-muted" />
      {state.error && <p className="w-full text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function SubmitChoice({ choice, label, color }: { choice: string; label: string; color: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="choice" value={choice} disabled={pending} className={`btn text-white ${color}`}>
      {label}
    </button>
  );
}
