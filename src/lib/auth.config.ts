import type { NextAuthConfig } from 'next-auth';

/**
 * Configuración de autenticación **sin Prisma**, para el middleware.
 *
 * POR QUÉ EXISTE: el middleware de Next.js corre en Edge Runtime, y
 * hasta ahora importaba `@/lib/auth`, que a su vez importa
 * `@/lib/db` — donde se construye `new PrismaClient()` en el cuerpo del
 * módulo. Prisma no funciona en Edge, así que ese `import` bastaba para
 * que TODA petición muriera con `TypeError: Invalid URL` antes de
 * llegar a la aplicación: producción respondía 500 en todas las rutas.
 *
 * Este archivo tiene solo lo que el middleware necesita para leer la
 * sesión del token: duración, página de acceso y los callbacks que
 * copian los datos del token a la sesión. Ni proveedores ni base de
 * datos — eso vive en `auth.ts`, que solo se carga en Node.
 *
 * Es el patrón que documenta Auth.js v5 para Prisma + middleware.
 */
export const authConfig = {
  // La sesión vence a los 20 minutos de inactividad. `updateAge: 0`
  // hace que el token se reemita en cada petición autenticada, así que
  // el reloj se reinicia mientras el usuario esté trabajando y solo
  // corre cuando de verdad está inactivo. `IdleLogout` (cliente) hace
  // el cierre visible; esto es el respaldo del servidor.
  session: { strategy: 'jwt', maxAge: 20 * 60, updateAge: 0 },
  jwt: { maxAge: 20 * 60 },
  pages: { signIn: '/login' },
  // Los proveedores se añaden en `auth.ts`: el de credenciales necesita
  // consultar la base y no puede vivir aquí.
  providers: [],
  callbacks: {
    async session({ session, token }: any) {
      session.user.id = token.userId as string;
      session.user.companyId = token.companyId as string;
      session.user.role = token.role as
        | 'master'
        | 'admin_owner'
        | 'admin_staff'
        | 'seguridad'
        | 'condomino'
        | 'contador';
      session.user.staffPermissions = token.staffPermissions as Record<string, boolean> | null;
      session.user.personId = (token.personId as string | null) ?? null;
      session.user.isBoardMember = Boolean(token.isBoardMember);
      session.user.boardAreas = (token.boardAreas as string[]) ?? [];
      return session;
    },
  },
} satisfies NextAuthConfig;
