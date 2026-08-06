'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { setActiveUnitAction } from '@/lib/actions/active-unit';
import { enTransicion } from '@/lib/accion-segura';

export type UnitOption = {
  propertyId: string;
  code: string;
  condominiumName: string;
};

/**
 * Selector de unidad del portal.
 *
 * Solo aparece cuando el residente tiene más de una: quien tiene una
 * sola no debería ver un control que no decide nada. Lo usa la persona
 * con propiedad en dos condominios de la misma administradora, que
 * entra con UNA cuenta y desde aquí elige cuál está mirando.
 */
export function UnitSwitcher({ units, selected }: { units: UnitOption[]; selected: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  if (units.length < 2) return null;

  return (
    <div className="mb-3 px-2">
      <label className="mb-1 flex items-center gap-1.5 text-[.62rem] font-semibold uppercase tracking-widest text-white/40">
        <Building2 size={11} /> Mi unidad
      </label>
      <select
        value={selected}
        disabled={pendiente}
        aria-label="Elegir unidad"
        onChange={(e) => {
          const propertyId = e.target.value;
          enTransicion(iniciar, async () => {
            await setActiveUnitAction(propertyId);
            router.refresh();
          });
        }}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-xs font-medium text-white outline-none transition focus:border-white/40 disabled:opacity-60"
      >
        {units.map((u) => (
          <option key={u.propertyId} value={u.propertyId} className="text-ink">
            {u.code} · {u.condominiumName}
          </option>
        ))}
      </select>
    </div>
  );
}
