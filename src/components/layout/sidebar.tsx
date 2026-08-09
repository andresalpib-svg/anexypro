'use client';

import { useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { SidebarShell } from '@/components/layout/sidebar-shell';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, ChevronDown } from 'lucide-react';
import type { Session } from 'next-auth';
import { NAV_CATEGORIES, CONTADOR_MODULES, type NavItem } from '@/lib/nav-config';
import { can, type PermissionArea } from '@/lib/rbac';
import { clsx } from 'clsx';

/**
 * Menú lateral jerárquico: categorías funcionales expandibles.
 *  - Los módulos sin permiso NO se muestran; una categoría sin
 *    módulos visibles desaparece completa.
 *  - Las categorías de un solo módulo se renderizan como enlace
 *    directo (menos clics).
 *  - La categoría del módulo activo se expande sola.
 */
const ROLE_LABEL: Record<string, string> = {
  admin_owner: 'Administrador',
  admin_staff: 'Supervisor',
  contador: 'Contador externo',
};

export function Sidebar({
  session,
  photoUrl,
  hiddenModules = [],
}: {
  session: Session;
  photoUrl?: string | null;
  /** Módulos apagados por el master para esta empresa. */
  hiddenModules?: string[];
}) {
  const pathname = usePathname();
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const isContador = session.user.role === 'contador';

  const allowed = (item: NavItem) =>
    (isContador ? Boolean(item.href && CONTADOR_MODULES.includes(item.href)) : true) &&
    (item.area ? can(session, item.area as PermissionArea) : true) &&
    (!item.ownerOnly || session.user.role === 'admin_owner') &&
    !(item.href && hiddenModules.includes(item.href));

  const categories = NAV_CATEGORIES.map((c) => ({ ...c, items: c.items.filter(allowed) })).filter(
    (c) => c.items.length > 0
  );

  const isActive = (item: NavItem) => Boolean(item.href && pathname.startsWith(item.href));

  const renderItem = (item: NavItem, indent: boolean) => {
    const Icon = item.icon;
    if (!item.href) {
      return (
        <span
          key={item.label}
          className={clsx('flex cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/30', indent && 'ml-4')}
          title="Próximamente"
        >
          <Icon size={16} />
          {item.label}
          <small className="ml-auto rounded-full border border-white/15 px-1.5 py-0.5 text-[.6rem]">pronto</small>
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        // Sin precarga: el menú tiene ~20 módulos y el navegador pedía
        // TODOS al entrar. Cada uno ejecuta el layout completo —cuatro
        // consultas a la base— más su propia página, así que una sola
        // visita disparaba quince peticiones simultáneas y agotaba el
        // pool de conexiones. Está en los registros del 7/8:
        // "max clients reached in session mode".
        prefetch={false}
        className={clsx(
          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
          indent && 'ml-4',
          isActive(item)
            ? 'bg-gradient-to-br from-royal to-royal-dark font-semibold text-white shadow-lg shadow-royal/30'
            : item.ia
              ? 'text-lumen hover:bg-white/5'
              : 'text-white/80 hover:bg-white/5 hover:text-white'
        )}
      >
        <Icon size={16} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.ia && (
          <small className="ml-auto rounded-full bg-lumen/20 px-1.5 py-0.5 text-[.6rem] font-bold text-lumen">IA</small>
        )}
      </Link>
    );
  };

  return (
    <SidebarShell width="w-72">
      <div className="mb-5 flex flex-none items-center gap-2 px-2">
        <Logo className="text-xl" />
      </div>

      <p className="mb-2 flex-none px-3 text-[.68rem] font-semibold uppercase tracking-widest text-white/40">
        Administradora
      </p>

      {/* Solo la lista de módulos se desplaza; el bloque del usuario
          queda anclado abajo (ver SidebarShell). */}
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain">
        {categories.map((category) => {
          // Categoría de un solo módulo → enlace directo, sin submenú.
          if (category.items.length === 1) return renderItem(category.items[0]!, false);

          const CatIcon = category.icon;
          const hasActive = category.items.some(isActive);
          const open = openOverrides[category.label] ?? hasActive;

          return (
            <div key={category.label}>
              <button
                type="button"
                onClick={() => setOpenOverrides((prev) => ({ ...prev, [category.label]: !open }))}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  hasActive && !open ? 'text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <CatIcon size={16} />
                <span className="min-w-0 flex-1 truncate text-left">{category.label}</span>
                <ChevronDown size={14} className={clsx('flex-none transition-transform', open && 'rotate-180')} />
              </button>
              {open && <div className="mt-0.5 flex flex-col gap-0.5">{category.items.map((item) => renderItem(item, true))}</div>}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto flex-none border-t border-deep-line px-2 pt-4">
        <Link href="/app/perfil" className="flex items-center gap-2.5 rounded-lg p-1 transition hover:bg-white/5">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={photoUrl} alt="" className="h-9 w-9 flex-none rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-royal to-royal-dark text-sm font-bold">
              {(session.user.name ?? 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{session.user.name}</p>
            <p className="truncate text-xs text-white/50">
              {ROLE_LABEL[session.user.role] ?? 'Usuario'}
            </p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={14} /> Cerrar sesión
        </button>
      </div>
    </SidebarShell>
  );
}
