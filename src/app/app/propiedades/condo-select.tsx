'use client';

import { useRouter, usePathname } from 'next/navigation';
import { setActiveCondoAction } from '@/lib/actions/active-condo';

/**
 * Selector del Condominio Activo: cambia la vista actual (misma
 * página, no salta de módulo) y guarda la selección para que persista
 * al navegar por el resto del sistema.
 */
export function CondoSelect({
  condos,
  selected,
}: {
  condos: { id: string; name: string }[];
  selected: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="field-input max-w-xs"
      value={selected}
      onChange={(e) => {
        const id = e.target.value;
        setActiveCondoAction(id);
        router.push(`${pathname}?condoId=${id}`);
      }}
      aria-label="Condominio activo"
    >
      {condos.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
