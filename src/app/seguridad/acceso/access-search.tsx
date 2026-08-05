'use client';

import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { searchAccessAction } from './actions';

type Result = Awaited<ReturnType<typeof searchAccessAction>>;

export function AccessSearch({ condominiumId }: { condominiumId: string }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result>({ members: [], vehicles: [] });
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    setQuery(value);
    startTransition(async () => {
      const r = await searchAccessAction(condominiumId, value);
      setResult(r);
    });
  }

  return (
    <div>
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar por nombre, unidad o placa…"
          className="field-input pl-9"
        />
      </div>

      {query && (
        <div className="card mt-3 divide-y divide-line">
          {isPending ? (
            <p className="p-4 text-sm text-muted">Buscando…</p>
          ) : result.members.length === 0 && result.vehicles.length === 0 ? (
            <p className="p-4 text-sm text-muted">Sin resultados.</p>
          ) : (
            <>
              {result.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="font-medium text-ink">{m.person.fullName}</span>
                  <span className="text-muted">{m.role} · {m.property.code}</span>
                </div>
              ))}
              {result.vehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="font-mono font-semibold text-ink">{v.plate}</span>
                  <span className="text-muted">
                    {[v.brand, v.color].filter(Boolean).join(' · ')} · {v.property.code}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
