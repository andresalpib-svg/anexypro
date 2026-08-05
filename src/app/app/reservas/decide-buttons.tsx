'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { decideReservationAction } from './actions';

export function DecideButtons({ reservationId }: { reservationId: string }) {
  const [pending, startTransition] = useTransition();

  const decide = (decision: 'confirmada' | 'rechazada') =>
    startTransition(async () => {
      const result = await decideReservationAction(reservationId, decision);
      if (result.ok) {
        toast.success(decision === 'confirmada' ? 'Reserva aprobada.' : 'Reserva rechazada.');
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide('confirmada')}
        className="text-xs font-semibold text-ok hover:underline disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide('rechazada')}
        className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
      >
        Rechazar
      </button>
    </div>
  );
}
