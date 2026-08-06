'use client';

import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { globalSearchAction } from '../search-actions';
import type { SearchResult } from '@/lib/services/search';
import { enTransicion } from '@/lib/accion-segura';

export default function SmartSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    setQuery(value);
    enTransicion(startTransition, async () => {
      setResults(await globalSearchAction(value));
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-sans text-2xl font-bold text-ink">Buscador Inteligente</h1>
        <p className="mt-1 text-sm text-muted">Condominios, unidades, documentos, tickets, asambleas y proyectos en un solo lugar.</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => onChange(e.target.value)} placeholder="Buscar…" className="field-input pl-9" />
      </div>

      <div className="card mt-4 divide-y divide-line">
        {isPending ? (
          <p className="p-4 text-sm text-muted">Buscando…</p>
        ) : query.length >= 2 && results.length === 0 ? (
          <p className="p-4 text-sm text-muted">Sin resultados.</p>
        ) : (
          results.map((r, i) => (
            <a key={i} href={r.href} className="flex items-center gap-3 p-4 text-sm hover:bg-canvas">
              <span className="chip bg-royal-soft text-royal">{r.type}</span>
              <span className="font-medium text-ink">{r.label}</span>
              <span className="ml-auto text-muted">{r.sublabel}</span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
