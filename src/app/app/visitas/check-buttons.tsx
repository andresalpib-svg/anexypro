'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { checkInAction, checkOutAction } from './actions';

export function CheckInButton({ authorizationId }: { authorizationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-semibold text-royal hover:underline disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const r = await checkInAction(authorizationId);
          if (r.ok) toast.success('Ingreso registrado.');
          else toast.error(r.error);
        })
      }
    >
      Registrar ingreso
    </button>
  );
}

export function CheckOutButton({ checkinId }: { checkinId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-semibold text-muted hover:underline disabled:opacity-50"
      onClick={() =>
        startTransition(async () => {
          const r = await checkOutAction(checkinId);
          if (r.ok) toast.success('Salida registrada.');
          else toast.error(r.error);
        })
      }
    >
      Registrar salida
    </button>
  );
}
