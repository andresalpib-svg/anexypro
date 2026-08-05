'use client';

import { usePathname, useRouter } from 'next/navigation';
import { setActiveCondoAction } from '@/lib/actions/active-condo';

export function SecurityCondoSelect({ condos, selected }: { condos: { id: string; name: string }[]; selected: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      className="field-input max-w-xs"
      value={selected}
      onChange={(e) => {
        setActiveCondoAction(e.target.value);
        router.push(`${pathname}?condoId=${e.target.value}`);
      }}
      aria-label="Condominio"
    >
      {condos.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
