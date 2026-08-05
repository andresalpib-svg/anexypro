'use client';

import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LogOut,
  Globe,
  Building2,
  Store,
  PlayCircle,
  LayoutGrid,
  HardDrive,
  Users,
  CreditCard,
  Menu,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';

const MASTER_NAV = [
  { label: 'Plataforma', href: '/master', icon: Globe },
  { label: 'Empresas', href: '/master/empresas', icon: Building2 },
  { label: 'Usuarios', href: '/master/usuarios', icon: Users },
  { label: 'Suscripciones', href: '/master/suscripciones', icon: CreditCard },
  { label: 'Proveedores varios', href: '/master/proveedores', icon: Store },
  { label: 'Contenido de Valor', href: '/master/contenido', icon: PlayCircle },
  { label: 'Módulos del panel', href: '/master/modulos', icon: LayoutGrid },
  { label: 'Almacenamiento', href: '/master/almacenamiento', icon: HardDrive },
];

/**
 * Encabezado del panel master.
 *
 * POR QUÉ NO ES UNA BARRA HORIZONTAL A SECAS: los ocho enlaces más el
 * logotipo, el distintivo y el bloque de usuario suman bastante más de
 * lo que cabe en un iPad; en horizontal se salían de la pantalla y no
 * había forma de llegar a los últimos. A partir de `xl` se muestran
 * todos en línea, como estaban; por debajo se recogen en un menú
 * desplegable.
 */
export function MasterHeader({ name }: { name: string }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  // Al navegar se cierra solo: quedarse abierto encima de la pantalla
  // recién abierta obliga a un toque extra siempre.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto]);

  const esActivo = (href: string) =>
    href === '/master' ? pathname === '/master' : pathname.startsWith(href);

  const enlace = (item: (typeof MASTER_NAV)[number], ancho: boolean) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
          ancho && 'w-full py-2.5 text-sm',
          esActivo(item.href)
            ? 'bg-royal text-white'
            : 'text-white/70 hover:bg-white/5 hover:text-white'
        )}
      >
        <Icon size={ancho ? 16 : 13} /> {item.label}
      </Link>
    );
  };

  return (
    <header className="relative flex-none bg-deep text-white">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Logo className="text-xl" />
        <span className="hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80 sm:flex">
          <Globe size={12} /> Panel Master
        </span>

        {/* Barra completa: solo cuando de verdad cabe. */}
        <nav className="ml-4 hidden items-center gap-1 xl:flex">
          {MASTER_NAV.map((item) => enlace(item, false))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-white/80 sm:inline">{name}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="hidden items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/5 hover:text-white sm:flex"
          >
            <LogOut size={13} /> Cerrar sesión
          </button>

          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            className="-mr-1 rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white xl:hidden"
          >
            {abierto ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Menú desplegable por debajo de xl. */}
      {abierto && (
        <>
          <div
            className="fixed inset-0 top-16 z-30 bg-black/50 xl:hidden"
            onClick={() => setAbierto(false)}
            aria-hidden
          />
          <nav className="absolute inset-x-0 top-16 z-40 flex flex-col gap-1 border-t border-white/10 bg-deep px-4 pb-5 pt-3 shadow-xl xl:hidden">
            {MASTER_NAV.map((item) => enlace(item, true))}
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-sm text-white/70">{name}</span>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                <LogOut size={13} /> Cerrar sesión
              </button>
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
