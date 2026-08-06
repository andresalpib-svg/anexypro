'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { confirmReadAction } from './actions';
import { enTransicion } from '@/lib/accion-segura';

/** Confirmación explícita: el residente declara que la leyó. */
export function ConfirmRead({ actionId }: { actionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  const router = useRouter();

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          enTransicion(start, async () => {
            const r = await confirmReadAction(actionId);
            if (!r.ok) setError(r.error ?? 'No se pudo confirmar.');
            else router.refresh();
          })
        }
        className="btn-primary !py-2 !text-sm"
      >
        <Check size={15} /> {enviando ? 'Confirmando…' : 'Confirmar lectura'}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
