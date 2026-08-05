'use client';

import { useRouter } from 'next/navigation';

export function ModuleFilter({ modules, selected }: { modules: string[]; selected?: string }) {
  const router = useRouter();
  return (
    <select
      className="field-input mt-4 max-w-xs"
      value={selected ?? ''}
      onChange={(e) => router.push(e.target.value ? `/app/auditoria?module=${e.target.value}` : '/app/auditoria')}
    >
      <option value="">Todos los módulos</option>
      {modules.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
