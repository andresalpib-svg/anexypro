'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Logo } from '@/components/ui/logo';

/**
 * Envoltura de las tres barras laterales (panel, portal y caseta).
 *
 * POR QUÉ EXISTE: las tres eran de ancho fijo y no se colapsaban nunca.
 * En un teléfono de 375 px, la del portal ocupaba 256 px —más de dos
 * tercios de la pantalla— y el contenido quedaba espachurrado en lo que
 * sobraba. Pesa sobre todo en el portal del residente, que es el que se
 * usa desde el teléfono.
 *
 * A partir de `lg` no cambia nada: la barra sigue fija en su columna,
 * exactamente como estaba. Por debajo se convierte en un cajón que se
 * abre desde una barra superior y se cierra al navegar, al tocar fuera
 * o con Escape.
 *
 * El contenido de cada barra no se toca: se pasa como `children`.
 */
export function SidebarShell({
  width = 'w-64',
  children,
}: {
  /** Ancho en escritorio; cada barra conserva el suyo. */
  width?: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const pathname = usePathname();

  // Al navegar se cierra solo: en un teléfono, quedarse abierto encima
  // de la pantalla recién abierta obliga a un toque extra siempre.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    // Con el cajón abierto, el fondo no debe desplazarse.
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', alPulsar);
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  return (
    <>
      {/* ---------- Barra superior (solo móvil) ---------- */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-deep-line bg-deep px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          aria-expanded={abierto}
          className="-ml-1 rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <Menu size={22} />
        </button>
        <Logo className="text-lg" />
      </div>

      {/* ---------- Fondo oscuro ---------- */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden
        />
      )}

      {/* ---------- La barra ---------- */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-none flex-col overflow-y-auto bg-deep px-3 py-5 text-white',
          'transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-none',
          width,
          abierto ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar menú"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X size={18} />
        </button>
        {children}
      </aside>
    </>
  );
}

// NO exportar constantes de este archivo hacia componentes de SERVIDOR:
// al llevar 'use client', React convierte cada export en una referencia
// de cliente, y una cadena de clases llega al `className` como
// "[object Object]". Los layouts escriben `pt-14 lg:pt-0` directamente.
