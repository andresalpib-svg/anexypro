'use client';

import { signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Globe, Building2, Store, PlayCircle, LayoutGrid, HardDrive, Users, CreditCard } from 'lucide-react';
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

export function MasterHeader({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <header className="flex h-16 flex-none items-center gap-3 bg-deep px-6 text-white">
      <Logo className="text-xl" />
      <span className="ml-2 flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">
        <Globe size={12} /> Panel Master
      </span>
      <nav className="ml-4 flex items-center gap-1">
        {MASTER_NAV.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/master' ? pathname === '/master' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                active ? 'bg-royal text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon size={13} /> {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-white/80">{name}</span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
      </div>
    </header>
  );
}
