import { LayoutDashboard, Search, DoorOpen, Waves, Package, AlertTriangle, ListTree } from 'lucide-react';

export const SECURITY_NAV = [
  { label: 'Dashboard', href: '/seguridad/dashboard', icon: LayoutDashboard },
  { label: 'Control de Acceso', href: '/seguridad/acceso', icon: Search },
  { label: 'Visitas', href: '/seguridad/visitas', icon: DoorOpen },
  { label: 'Reservas', href: '/seguridad/reservas', icon: Waves },
  { label: 'Paquetería', href: '/seguridad/paquetes', icon: Package },
  { label: 'Incidentes', href: '/seguridad/incidentes', icon: AlertTriangle },
  { label: 'Bitácora', href: '/seguridad/bitacora', icon: ListTree },
];
