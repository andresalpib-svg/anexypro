import { prisma } from '@/lib/db';
import { NAV_CATEGORIES } from '@/lib/nav-config';

/**
 * Módulos que el usuario master puede ocultar del panel de una
 * empresa. La clave es el href del módulo — estable, único y ya
 * presente en nav-config.
 */
export type ToggleableModule = { href: string; label: string; category: string };

/**
 * El Dashboard nunca se oculta: es la pantalla a la que cae el
 * usuario al iniciar sesión, así que dejarlo apagar rompería el
 * ingreso al panel.
 */
const ALWAYS_VISIBLE = new Set(['/app/dashboard']);

export function toggleableModules(): ToggleableModule[] {
  return NAV_CATEGORIES.flatMap((c) =>
    c.items
      .filter((i) => i.href && !ALWAYS_VISIBLE.has(i.href))
      .map((i) => ({ href: i.href as string, label: i.label, category: c.label }))
  );
}

export async function getHiddenModules(companyId: string): Promise<string[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { hiddenModules: true },
  });
  return company?.hiddenModules ?? [];
}

export async function setHiddenModules(companyId: string, hidden: string[]) {
  // Se filtra contra el catálogo real para que un href inventado o un
  // módulo protegido no llegue nunca a la base.
  const allowed = new Set(toggleableModules().map((m) => m.href));
  const clean = Array.from(new Set(hidden.filter((h) => allowed.has(h))));
  return prisma.company.update({ where: { id: companyId }, data: { hiddenModules: clean } });
}

/** ¿Esta ruta del panel está oculta para la empresa? */
export function isModuleHidden(hidden: string[], pathname: string): boolean {
  return hidden.some((h) => pathname === h || pathname.startsWith(`${h}/`));
}
