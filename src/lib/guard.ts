import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can, type PermissionArea } from '@/lib/rbac';
import { NAV_ITEMS, CONTADOR_MODULES } from '@/lib/nav-config';
import { canAccessCondo } from '@/lib/services/condominiums';

/**
 * Puerta de entrada de las acciones del panel de la administración.
 *
 * Una Server Action de Next.js es un endpoint HTTP como cualquier otro:
 * el middleware y el layout que gobiernan la PANTALLA no la protegen a
 * ella. Comprobar únicamente que hay sesión deja el resto —qué rol es,
 * si el módulo le corresponde, si el condominio es suyo— en manos del
 * formulario, y un campo oculto se cambia desde el navegador en dos
 * segundos. Cada acción tiene que preguntárselo por su cuenta, y esta
 * es la función que lo pregunta.
 *
 * Las reglas no se repiten aquí: se leen de `nav-config`, que ya decide
 * qué ve cada quien en la barra lateral. Así la acción y el menú no
 * pueden discrepar — que es como se abren estos huecos.
 *
 * Devuelve la sesión si el paso está permitido, o `null`. Nunca lanza:
 * quien la llama responde con su propio mensaje, que es lo que ya hacen
 * todas las acciones del panel.
 */

export type UserRole = Session['user']['role'];

/** Los tres roles que entran al panel. El resto tiene su propio portal. */
export const PANEL_ROLES = ['admin_owner', 'admin_staff', 'contador'] as const;

export type GuardOptions = {
  /**
   * Módulo al que pertenece la acción, por su href de `nav-config`
   * (p. ej. `/app/reservas`). De ahí salen el área de permisos y la
   * marca `ownerOnly`; y para el contador, si el módulo está en su
   * lista blanca.
   */
  module?: string;
  /** Roles admitidos. Por omisión, los tres del panel. */
  roles?: readonly UserRole[];
  /** Área de permisos, para acciones que no cuelgan de un módulo. */
  area?: PermissionArea;
  /**
   * Condominio sobre el que se va a actuar. Se comprueba contra los
   * condominios asignados: el supervisor solo administra los suyos.
   */
  condominiumId?: string | null;
};

/**
 * Empresa DEMO vencida: cierra el paso a las Server Actions, no solo a
 * la pantalla. `src/app/app/layout.tsx` ya manda al `admin_owner` a
 * `/app/suscripcion` y al resto a `BlockedScreen`, pero eso protege la
 * PANTALLA — una acción disparada desde una pestaña que ya estaba
 * abierta no vuelve a pasar por el layout, y sin este chequeo se
 * ejecutaba igual. Ver PASO 4: "no podrá... realizar operaciones".
 *
 * Se limita a `isDemo` a propósito: una empresa REAL en mora sigue
 * dejando actuar desde una pestaña ya abierta (decisión previa,
 * documentada en `app/app/layout.tsx` — "no se borra ni se oculta
 * información: solo se cierra el paso", y el `admin_owner` necesita
 * poder seguir viendo `/app/suscripcion`). Tocar eso no lo pidió nadie
 * en este paso.
 */
async function demoBloqueada(companyId: string): Promise<boolean> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isDemo: true, blockedAt: true },
  });
  return Boolean(empresa?.isDemo && empresa.blockedAt);
}

export async function requirePanel(opts: GuardOptions = {}): Promise<Session | null> {
  const session = await auth();
  if (!session?.user) return null;

  const roles = opts.roles ?? PANEL_ROLES;
  if (!roles.includes(session.user.role)) return null;

  if (await demoBloqueada(session.user.companyId)) return null;

  const item = opts.module ? NAV_ITEMS.find((i) => i.href === opts.module) : undefined;

  // Configuración y otros módulos marcados solo para el titular.
  if (item?.ownerOnly && session.user.role !== 'admin_owner') return null;

  // El contador es externo: solo lo financiero y documental.
  if (session.user.role === 'contador' && opts.module && !CONTADOR_MODULES.includes(opts.module)) {
    return null;
  }

  const area = (opts.area ?? item?.area) as PermissionArea | undefined;
  if (area && !can(session, area)) return null;

  if (opts.condominiumId && !(await canAccessCondo(session, opts.condominiumId))) return null;

  return session;
}

/**
 * Acciones del portal de la caseta.
 *
 * Confirma el rol —sin esto, cualquier sesión válida podía consultar
 * residentes, vehículos y paquetes por estas acciones— y, cuando la
 * acción dice sobre qué condominio actúa, que ese condominio sea de
 * los suyos. Ocultarle un condominio del selector no basta: el id
 * viaja en el formulario y se cambia desde el navegador.
 *
 * Un oficial sin asignaciones atiende toda la empresa, igual que
 * antes (ver `listCondominiumsForSession`).
 */
export async function requireSecurity(condominiumId?: string | null): Promise<Session | null> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') return null;
  // A diferencia de una empresa real en mora (la caseta sigue operando
  // a propósito: cortar el control de acceso físico por una factura
  // impaga arriesga a residentes ajenos al problema comercial), una
  // demo vencida no tiene ese riesgo — son datos ficticios.
  if (await demoBloqueada(session.user.companyId)) return null;
  if (condominiumId && !(await canAccessCondo(session, condominiumId))) return null;
  return session;
}

/** Acciones reservadas al administrador principal de la empresa. */
export async function requireOwner(opts: Omit<GuardOptions, 'roles'> = {}): Promise<Session | null> {
  return requirePanel({ ...opts, roles: ['admin_owner'] });
}

/**
 * Segundo paso cuando el condominio no se conoce hasta haber consultado
 * la entidad: se pide la sesión una vez con `requirePanel`, se resuelve
 * el condominio con los ayudantes de `entity-scope`, y se comprueba con
 * esto. Evita volver a leer la sesión.
 */
export async function allowsCondo(session: Session, condominiumId: string): Promise<boolean> {
  return canAccessCondo(session, condominiumId);
}

/** Mensaje único, para no inventar uno distinto en cada acción. */
export const SIN_PERMISO = 'No tienes permiso para hacer esto.';
