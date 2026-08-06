'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { globalSearchAction } from '@/app/app/asistentes-ia/search-actions';
import type { SearchResult } from '@/lib/services/search';
import { enTransicion } from '@/lib/accion-segura';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    setOpen(true);
    enTransicion(startTransition, async () => {
      const r = await globalSearchAction(value);
      setResults(r);
    });
  }

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 sm:ml-4 sm:max-w-sm">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        placeholder="Buscar condominios, unidades, documentos…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => query && setOpen(true)}
        className="field-input py-2 pl-9 text-sm"
      />
      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
          {isPending ? (
            <p className="p-3 text-sm text-muted">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted">Sin resultados.</p>
          ) : (
            results.map((r, i) => (
              <a key={i} href={r.href} className="flex items-center gap-2 border-b border-line p-3 text-sm last:border-0 hover:bg-canvas">
                <span className="chip bg-royal-soft text-royal text-[.65rem]">{r.type}</span>
                <span className="font-medium text-ink">{r.label}</span>
                <span className="ml-auto text-xs text-muted">{r.sublabel}</span>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}
