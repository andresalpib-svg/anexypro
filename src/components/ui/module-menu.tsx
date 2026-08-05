'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { MoreVertical, Pencil, ChevronRight, ArrowRight } from 'lucide-react';
import type { ModuleOption } from '@/lib/module-options';

/**
 * Menú de opciones del módulo — los tres puntos junto al nombre.
 *
 * Un solo nivel de despliegue: se abre, se ve "Editar", y al tocarlo se
 * despliegan ahí mismo todas las opciones de ese módulo. No navega a
 * ninguna pantalla intermedia; quien busca configurar algo lo tiene a
 * dos toques desde cualquier módulo, siempre en el mismo sitio.
 *
 * Las opciones con `anchor` llevan a una sección de la misma pantalla y
 * la resaltan un instante: sin ese destello, un desplazamiento a media
 * página deja al usuario sin saber qué pasó.
 */
export function ModuleMenu({ options }: { options: ModuleOption[] }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) cerrar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setEditando(false);
  }

  if (options.length === 0) return null;

  /** Desplaza hasta la sección y la resalta para que se note. */
  function irA(anchor: string) {
    cerrar();
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-royal', 'ring-offset-2', 'rounded-card');
    setTimeout(() => el.classList.remove('ring-2', 'ring-royal', 'ring-offset-2', 'rounded-card'), 1800);
  }

  return (
    <div ref={cajaRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Opciones del módulo"
        title="Opciones del módulo"
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink ${
          abierto ? 'bg-canvas text-ink' : ''
        }`}
      >
        <MoreVertical size={18} />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute left-0 z-40 mt-1 w-80 overflow-hidden rounded-xl border border-line bg-paper shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setEditando((v) => !v)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-canvas"
          >
            <Pencil size={15} className="text-royal" />
            <span className="flex-1">Editar</span>
            <ChevronRight
              size={15}
              className={`text-muted transition-transform ${editando ? 'rotate-90' : ''}`}
            />
          </button>

          {editando && (
            <ul className="border-t border-line bg-canvas/50 py-1">
              {options.map((o) => {
                const contenido = (
                  <>
                    <span className="block text-sm font-medium text-ink">{o.label}</span>
                    {o.description && (
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{o.description}</span>
                    )}
                  </>
                );

                return (
                  <li key={o.label}>
                    {o.href ? (
                      <Link
                        href={o.href}
                        onClick={cerrar}
                        role="menuitem"
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-canvas"
                      >
                        <ArrowRight size={13} className="mt-1 flex-none text-muted" />
                        <span className="flex-1">{contenido}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => o.anchor && irA(o.anchor)}
                        className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-canvas"
                      >
                        <ArrowRight size={13} className="mt-1 flex-none text-muted" />
                        <span className="flex-1">{contenido}</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
