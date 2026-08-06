'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { setIncidentStatusAction } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export function IncidentStatusSelect({ incidentId, status }: { incidentId: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue=""
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        if (!value) return;
        enTransicion(startTransition, async () => {
          await setIncidentStatusAction(incidentId, value);
          toast.success('Estado del incidente actualizado.');
        });
      }}
      className="field-input w-auto py-1 text-xs"
    >
      <option value="" disabled>
        Cambiar…
      </option>
      {status === 'abierto' && <option value="en_seguimiento">En seguimiento</option>}
      <option value="cerrado">Cerrar</option>
    </select>
  );
}
