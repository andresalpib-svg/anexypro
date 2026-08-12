import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, withTenantContext } from '@/lib/db';
import { authConfig } from '@/lib/auth.config';
import { clientIp, isRateLimited, registerHit } from '@/lib/rate-limit';

// Mismo esquema de roles que el prototipo: admin_owner, admin_staff,
// seguridad, condomino. NO hay selector de "tipo de usuario" en el
// login — el rol lo asigna el usuario master desde Configuración →
// Usuarios y Permisos (decisión de producto explícita, ver
// diseno-ajustes-visuales-globales.md sección "Rediseño de la página
// de autenticación").
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Hash señuelo: se compara contra él cuando el correo NO existe.
 *
 * Sin esto, un correo inexistente respondía de inmediato y uno real
 * tardaba lo que tarda bcrypt (~230 ms). Esa diferencia basta para
 * averiguar qué correos están dados de alta en la plataforma sin
 * acertar ni una contraseña. Comparar siempre iguala los tiempos.
 *
 * No corresponde a ninguna contraseña utilizable.
 */
const HASH_SENUELO = '$2a$12$2ElpfpIaRIfg0KcInYOzrulbkqwWexWDTWg4KuulYh8N5efXm.4IG';

/**
 * Límite de intentos fallidos por cuenta antes de rechazar el acceso
 * durante un rato. La cuenta NO se bloquea: solo se deja de aceptar
 * intentos hasta que pase la ventana, así nadie puede dejar fuera a un
 * usuario legítimo a base de fallar su contraseña a propósito.
 */
const MAX_INTENTOS = 8;
const VENTANA_MINUTOS = 15;

/**
 * Freno por IP, aparte del freno por cuenta de arriba.
 *
 * El freno por cuenta (`demasiadosIntentos`) no detecta "password
 * spraying": una misma contraseña probada contra miles de cuentas
 * distintas nunca llega a los 8 intentos en NINGUNA cuenta individual.
 * Este freno cuenta los intentos fallidos por IP, sin importar contra
 * qué cuenta — así si son muchas cuentas distintas desde la misma IP,
 * igual se activa.
 *
 * El máximo es más alto que el de cuenta a propósito: una IP puede ser
 * la salida compartida de una oficina de administración con varios
 * usuarios reales equivocándose de contraseña por su cuenta.
 */
const IP_MAX_INTENTOS = 20;
const IP_VENTANA_MINUTOS = 15;
const ipBucket = (ip: string) => `login-fail:${ip}`;

/**
 * Cada cuánto se releen rol, permisos y estado desde la base. Acota a
 * dos minutos la ventana en la que un usuario bloqueado sigue dentro,
 * sin pagar una consulta en cada navegación.
 */
const REVALIDAR_CADA_MS = 2 * 60 * 1000;

/** ¿Esta cuenta acumula demasiados intentos fallidos recientes? */
async function demasiadosIntentos(companyId: string, userId: string): Promise<boolean> {
  const desde = new Date(Date.now() - VENTANA_MINUTOS * 60 * 1000);
  const fallidos = await withTenantContext(companyId, (tx) =>
    tx.authLog.count({
      where: { userId, eventType: 'login_failed', createdAt: { gte: desde } },
    })
  );
  return fallidos >= MAX_INTENTOS;
}

/**
 * Configuración completa: la base compartida (`auth.config.ts`) más lo
 * que necesita la base de datos. Este archivo NO lo puede importar el
 * middleware: arrastra Prisma, que no funciona en Edge Runtime.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const ip = clientIp(request.headers);

        // Freno por IP, antes de tocar la base o calcular el bcrypt: si
        // ya hay demasiados intentos fallidos desde esta IP (contra
        // cualquier cuenta — así es como se frena el "password
        // spraying" que el freno por cuenta no ve), se corta acá. No
        // reintroduce el hueco de enumeración por tiempo: el bloqueo no
        // depende de qué correo se probó, así que no delata nada sobre
        // una cuenta en particular. Si no se pudo determinar la IP, se
        // deja pasar (mejor no frenar que frenar a todo el mundo por
        // igual con un encabezado ausente).
        if (ip && (await isRateLimited(ipBucket(ip), { max: IP_MAX_INTENTOS, windowMs: IP_VENTANA_MINUTOS * 60_000 }))) {
          return null;
        }

        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Se busca en dos pasos a propósito. `users` no lleva RLS —hay
        // que poder buscar por correo antes de saber de qué empresa es
        // nadie—, pero `persons` sí, y traerla con un `include` en la
        // misma consulta hace que Postgres evalúe la política sin
        // contexto de empresa y falle. Primero el usuario, y con su
        // empresa ya en la mano, su ficha de persona.
        // `company` va en el mismo `include`: `companies` tampoco lleva
        // RLS (como `users`), así que unirlas acá no dispara el mismo
        // problema que traer `persons` en esta consulta (ver comentario
        // de más abajo).
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, status: 'activo' },
          include: { company: { select: { isDemo: true, blockedAt: true } } },
        });

        // Se compara SIEMPRE, exista el usuario o no: si se retornara
        // antes, la respuesta inmediata delataría qué correos existen.
        const valid = await bcrypt.compare(password, user?.passwordHash ?? HASH_SENUELO);
        if (!user) {
          if (ip) await registerHit(ipBucket(ip));
          return null;
        }

        // Freno a la fuerza bruta. Va después de comparar para que el
        // tiempo de respuesta no cambie al activarse.
        if (await demasiadosIntentos(user.companyId, user.id)) return null;

        // PASO 4 — empresa DEMO vencida: no entra, ni con la contraseña
        // correcta. El mensaje que ya usa el formulario de login cubre
        // este caso a propósito ("si tu acceso fue suspendido, contacta
        // a la administración"), así que no hace falta un texto nuevo.
        // Limitado a `isDemo`: una empresa REAL en mora sigue entrando
        // y viendo `/app/suscripcion` — eso no lo tocó este paso.
        if (user.company?.isDemo && user.company.blockedAt) return null;

        if (!valid) {
          if (ip) await registerHit(ipBucket(ip));
          await withTenantContext(user.companyId, (tx) =>
            tx.authLog.create({ data: { userId: user.id, eventType: 'login_failed', ip } })
          );
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        // Ya se conoce la empresa: la ficha de persona y las bitácoras
        // se leen y escriben con su contexto.
        const person = await withTenantContext(user.companyId, async (tx) => {
          await tx.authLog.create({ data: { userId: user.id, eventType: 'login_success', ip } });
          await tx.auditLog.create({
            data: { companyId: user.companyId, userId: user.id, userName: user.fullName, module: 'Autenticación', action: 'Inicio de sesión' },
          });
          return tx.person.findFirst({
            where: { userId: user.id },
            select: { id: true, fullName: true, isBoardMember: true, boardAreas: true },
          });
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          companyId: user.companyId,
          role: user.role,
          staffPermissions: (user.staffPermissions as Record<string, boolean> | null) ?? null,
          personId: person?.id ?? null,
          isBoardMember: person?.isBoardMember ?? false,
          boardAreas: person?.boardAreas ?? [],
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.companyId = (user as any).companyId;
        token.role = (user as any).role;
        token.staffPermissions = (user as any).staffPermissions;
        token.personId = (user as any).personId;
        token.isBoardMember = (user as any).isBoardMember;
        token.boardAreas = (user as any).boardAreas;
        token.revisadoEn = Date.now();
        return token;
      }

      // Revalidación periódica contra la base.
      //
      // El token solo se escribía al iniciar sesión, así que bloquear a
      // un usuario, cambiarle el rol o quitarle un permiso no tenía
      // ningún efecto hasta que su sesión venciera. Ahora se relee cada
      // pocos minutos: no en cada petición, porque este callback corre
      // en TODAS y sería una consulta por navegación.
      //
      // NUNCA en Edge. Este mismo callback lo ejecuta el middleware,
      // que corre en Edge Runtime, y ahí Prisma no funciona: lanzaba
      // `JWTSessionError` en cada petición (comprobado). El middleware
      // solo decide qué portal corresponde a cada rol; la autorización
      // de verdad —layouts, `guard.ts`, server actions— corre en Node y
      // sí revalida.
      if (process.env.NEXT_RUNTIME === 'edge') return token;

      const revisadoEn = (token.revisadoEn as number | undefined) ?? 0;
      if (Date.now() - revisadoEn < REVALIDAR_CADA_MS) return token;

      const actual = await prisma.user.findUnique({
        where: { id: token.userId as string },
        select: { status: true, role: true, staffPermissions: true, companyId: true },
      });

      // Usuario borrado o bloqueado: se invalida el token devolviendo
      // null, y la siguiente petición cae en el login.
      if (!actual || actual.status !== 'activo') return null;

      token.role = actual.role;
      token.staffPermissions = (actual.staffPermissions as Record<string, boolean> | null) ?? null;
      token.companyId = actual.companyId;
      token.revisadoEn = Date.now();
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.companyId = token.companyId as string;
      session.user.role = token.role as 'master' | 'admin_owner' | 'admin_staff' | 'seguridad' | 'condomino' | 'contador';
      session.user.staffPermissions = token.staffPermissions as Record<string, boolean> | null;
      session.user.personId = token.personId as string | null;
      session.user.isBoardMember = token.isBoardMember as boolean;
      session.user.boardAreas = token.boardAreas as string[];
      return session;
    },
  },
});
