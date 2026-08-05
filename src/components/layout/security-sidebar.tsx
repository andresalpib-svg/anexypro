'use client';

import Link from 'next/link';
import { Logo } from '@/components/ui/logo';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import type { Session } from 'next-auth';
import { clsx } from 'clsx';
import { SECURITY_NAV } from '@/lib/security-nav-config';

export function SecuritySidebar({ session }: { session: Session }) {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-60 flex-none flex-col overflow-y-auto bg-deep px-3 py-5 text-white">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Logo className="text-xl" />
      </div>
      <p className="mb-2 px-3 text-[.68rem] font-semibold uppercase tracking-widest text-white/40">Portal de Seguridad</p>
      <nav className="flex flex-1 flex-col gap-0.5">
        {SECURITY_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                active ? 'bg-gradient-to-br from-royal to-royal-dark font-semibold text-white shadow-lg shadow-royal/30' : 'text-white/80 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-deep-line px-2 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-royal to-royal-dark text-sm font-bold">
            {(session.user.name ?? 'G').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.user.name}</p>
            <p className="truncate text-xs text-white/50">Oficial de seguridad</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
