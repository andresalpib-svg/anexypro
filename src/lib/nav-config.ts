import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  Home,
  Wallet,
  Mail,
  Calendar,
  Waves,
  DoorOpen,
  Shield,
  Wrench,
  FolderKanban,
  ClipboardCheck,
  FileText,
  BarChart3,
  Bot,
  Settings,
  History,
  PlayCircle,
  ListChecks,
  Activity,
  Landmark,
  Cog,
  FileCheck2,
  FolderTree,
  Gavel,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string | null; // null = todavía no construido en esta fase
  icon: LucideIcon;
  ia?: boolean;
  area?: string; // para can(session, area) — módulos sin área no se gatean individualmente
  ownerOnly?: boolean; // solo visible para admin_owner (p. ej. Configuración)
};

export type NavCategory = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

/**
 * Navegación por categorías funcionales (estándar SaaS empresarial):
 * el usuario localiza cualquier módulo en segundos y las categorías
 * sin permisos desaparecen completas. Ningún módulo se eliminó —
 * solo se reorganizaron.
 */
export const NAV_CATEGORIES: NavCategory[] = [
  {
    label: 'Inicio',
    icon: LayoutDashboard,
    items: [{ label: 'Dashboard ejecutivo', href: '/app/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Operación del Condominio',
    icon: Activity,
    items: [
      { label: 'Gestión de Tareas', href: '/app/gestion', icon: ListChecks },
      { label: 'Comunicados', href: '/app/comunicados', icon: Mail, area: 'comunicados' },
      { label: 'Contenido de Valor', href: '/app/contenido', icon: PlayCircle, area: 'comunicados' },
      { label: 'Calendario', href: '/app/calendario', icon: Calendar },
      { label: 'Reservas', href: '/app/reservas', icon: Waves },
      { label: 'Visitas y Accesos', href: '/app/visitas', icon: DoorOpen },
      { label: 'Seguridad', href: '/app/seguridad', icon: Shield, area: 'seguridad' },
      { label: 'Gestión de Incumplimientos', href: '/app/incumplimientos', icon: Gavel, area: 'incumplimientos' },
      { label: 'Mantenimientos de Áreas Comunes', href: '/app/mantenimiento', icon: Wrench, area: 'mantenimientos' },
      { label: 'Proyectos', href: '/app/proyectos', icon: FolderKanban, area: 'proyectos' },
    ],
  },
  {
    label: 'Administración',
    icon: Building2,
    items: [
      { label: 'Gestión de Condominios', href: '/app/condominios', icon: Building2 },
      { label: 'Propiedades y Residentes', href: '/app/propiedades', icon: Home },
    ],
  },
  {
    label: 'Gestión Financiera',
    icon: Wallet,
    items: [{ label: 'Finanzas y Contabilidad', href: '/app/finanzas', icon: Wallet, area: 'finanzas' }],
  },
  {
    label: 'Documentación',
    icon: FileText,
    items: [
      { label: 'Repositorio de Documentos', href: '/app/repositorio', icon: FolderTree, area: 'documentos' },
      { label: 'Documentos', href: '/app/documentos', icon: FileText, area: 'documentos' },
      { label: 'Emisión de Documentos', href: '/app/emision-documentos', icon: FileCheck2, area: 'documentos' },
    ],
  },
  {
    label: 'Asambleas y Gobierno',
    icon: Landmark,
    items: [{ label: 'Asambleas', href: '/app/asambleas', icon: ClipboardCheck, area: 'asambleas' }],
  },
  {
    label: 'Reportes y Analítica',
    icon: BarChart3,
    items: [{ label: 'Reportes', href: '/app/reportes', icon: BarChart3, area: 'reportes' }],
  },
  {
    label: 'Inteligencia Artificial',
    icon: Bot,
    items: [{ label: 'Asistentes IA', href: '/app/asistentes-ia', icon: Bot, ia: true, area: 'asistentesia' }],
  },
  {
    label: 'Configuración',
    icon: Cog,
    items: [
      { label: 'Configuración', href: '/app/configuracion', icon: Settings, ownerOnly: true },
      { label: 'Auditoría', href: '/app/auditoria', icon: History, area: 'auditoria' }, // nunca para Junta Directiva
    ],
  },
];

/**
 * Módulos a los que llega el rol contador. Es una lista blanca
 * explícita y no una regla por permisos, porque la mayoría de los
 * módulos no declaran `area` y quedarían visibles por omisión — un
 * contador externo no debe ver residentes, visitas ni seguridad.
 */
export const CONTADOR_MODULES = [
  '/app/finanzas',
  '/app/repositorio',
  '/app/contabilidad',
  '/app/documentos',
  '/app/reportes',
];

/** Lista plana — la usan el Topbar (migas) y otros consumidores. */
export const NAV_ITEMS: NavItem[] = NAV_CATEGORIES.flatMap((c) => c.items);

/**
 * Módulo de nav-config al que pertenece una ruta del panel, por
 * prefijo (`/app/finanzas/gastos` → `/app/finanzas`). Gana el href
 * más largo, por si algún día un módulo cuelga de otro.
 *
 * Lo usa el layout de /app para aplicar a la PANTALLA las mismas
 * reglas (`area`, `ownerOnly`, lista blanca del contador) que
 * `guard.ts` aplica a las acciones: ocultar el módulo del menú no
 * basta si el usuario escribe la dirección a mano.
 */
export function navItemForPath(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (!item.href) continue;
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > (best.href?.length ?? 0)) best = item;
    }
  }
  return best;
}
