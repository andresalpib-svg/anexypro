'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { ejecutar, enTransicion } from '@/lib/accion-segura';
import { reactivarDemoAction } from './actions';

/**
 * "Reactivar demo" — solo aparece en el listado cuando el estado es
 * `DEMO_VENCIDO` (VALIDACIÓN EN FRONTEND: la página no dibuja este
 * botón para ninguna otra demo). La de verdad, la que no se puede
 * saltar cambiando el DOM a mano, es la del servidor
 * (`reactivarDemoAction` → `guardMaster()` + `reactivateDemo`).
 */
export function ReactivarDemoButton({ companyId, clientName }: { companyId: string; clientName: string }) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-royal/30 bg-royal/5 py-1.5 text-xs font-semibold text-royal transition hover:bg-royal/10 disabled:opacity-50"
      onClick={() => {
        if (
          !window.confirm(
            `¿Reactivar la demo de "${clientName}"? Vuelve a quedar activa por 15 días más, contados desde ahora.`
          )
        )
          return;
        enTransicion(iniciar, async () => {
          const r = await ejecutar(() => reactivarDemoAction(companyId));
          if (!r) return; // el aviso ya lo dio `ejecutar`
          if (r.ok) toast.success('Demo reactivada.');
          else toast.error(r.error ?? 'No se pudo reactivar la demo.');
        });
      }}
    >
      <RotateCcw size={13} /> {pendiente ? 'Reactivando…' : 'Reactivar demo'}
    </button>
  );
}
