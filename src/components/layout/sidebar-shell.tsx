'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
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
 * Tiene DOS comportamientos distintos, porque el problema es distinto:
 *
 *  - En móvil (< lg) es un cajón: se abre desde la barra superior y se
 *    cierra al navegar, al tocar fuera o con Escape.
 *  - En escritorio (>= lg) es una columna fija que ahora se puede
 *    OCULTAR con la flecha del encabezado, para dejarle la pantalla
 *    completa a tablas anchas y calendarios. Con la barra oculta queda
 *    una pestaña en el borde izquierdo para traerla de vuelta.
 *
 * La preferencia se guarda en `localStorage` y no en una cookie a
 * propósito: es una decisión de cada pantalla, no del servidor, y no
 * tiene que viajar en cada petición.
 *
 * El contenido de cada barra no se toca: se pasa como `children`.
 *
 * CÓMO SE DESPLAZA (y por qué así). La barra NO se desplaza entera:
 * se desplaza SOLO la lista de módulos, y el bloque del usuario con
 * "Cerrar sesión" queda anclado abajo, siempre visible. Con la barra
 * entera desplazable, en un teléfono con muchos módulos había que
 * recorrer toda la lista para llegar al pie… y aun así no aparecía,
 * porque `h-screen` (100vh) mide MÁS que la pantalla útil cuando el
 * navegador móvil muestra su propia barra: el pie quedaba debajo de
 * ella, fuera de alcance. Por eso dos cosas aquí:
 *
 *  1. `h-dvh` (alto de ventana DINÁMICO, el que de verdad se ve) con
 *     `h-screen` de respaldo para navegadores que no lo conocen.
 *  2. `overflow-hidden` en la barra: el desplazamiento lo pone cada
 *     `<nav>` con `flex-1 min-h-0 overflow-y-auto`. Toda barra que use
 *     esta envoltura DEBE marcar así su lista, o su contenido se
 *     recorta.
 */

const CLAVE_OCULTO = 'anexypro-menu-oculto';

export function SidebarShell({
  width = 'w-64',
  children,
}: {
  /** Ancho en escritorio; cada barra conserva el suyo. */
  width?: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const [oculto, setOculto] = useState(false);
  const pathname = usePathname();

  // La preferencia se lee DESPUÉS de montar: el servidor no conoce el
  // `localStorage`, y pintarla en el primer render rompería la
  // hidratación.
  useEffect(() => {
    setOculto(window.localStorage.getItem(CLAVE_OCULTO) === '1');
  }, []);

  const alternarOculto = (valor: boolean) => {
    setOculto(valor);
    try {
      window.localStorage.setItem(CLAVE_OCULTO, valor ? '1' : '0');
    } catch {
      // Navegación privada con almacenamiento bloqueado: el menú se
      // oculta igual, solo que no recuerda la decisión.
    }
  };

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
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-none flex-col overflow-hidden bg-deep px-3 py-5 text-white',
          'supports-[height:100dvh]:h-dvh',
          'transition-transform duration-200 lg:static lg:translate-x-0 lg:transition-none',
          width,
          abierto ? 'translate-x-0' : '-translate-x-full',
          // Oculta solo la columna de escritorio: en móvil sigue siendo
          // el cajón, que se gobierna con `abierto`.
          oculto && 'lg:hidden'
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
        <button
          type="button"
          onClick={() => alternarOculto(true)}
          aria-label="Ocultar el menú de módulos"
          title="Ocultar el menú"
          className="absolute right-3 top-4 hidden rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white lg:block"
        >
          <ChevronLeft size={18} />
        </button>
        {children}
      </aside>

      {/* ---------- Pestaña para traer la barra de vuelta ----------
           Blanco de clic generoso (36×72): pegado al borde de la
           pantalla, un botón estrecho se falla más de lo que parece. */}
      {oculto && (
        <button
          type="button"
          onClick={() => alternarOculto(false)}
          aria-label="Mostrar el menú de módulos"
          title="Mostrar el menú"
          className="fixed left-0 top-1/2 z-40 hidden h-[72px] w-9 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-deep-line bg-deep text-white/70 shadow-lg transition hover:bg-deep-dark hover:text-white lg:flex"
        >
          <ChevronRight size={18} />
        </button>
      )}
    </>
  );
}

// NO exportar constantes de este archivo hacia componentes de SERVIDOR:
// al llevar 'use client', React convierte cada export en una referencia
// de cliente, y una cadena de clases llega al `className` como
// "[object Object]". Los layouts escriben `pt-14 lg:pt-0` directamente.
