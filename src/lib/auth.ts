import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, withTenantContext } from '@/lib/db';

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  // La sesión vence a los 20 minutos de inactividad. `updateAge: 0`
  // hace que el token se reemita en cada petición autenticada, así que
  // el reloj se reinicia mientras el usuario esté trabajando y solo
  // corre cuando de verdad está inactivo. `IdleLogout` (cliente) hace
  // el cierre visible; esto es el respaldo del servidor.
  session: { strategy: 'jwt', maxAge: 20 * 60, updateAge: 0 },
  jwt: { maxAge: 20 * 60 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Se busca en dos pasos a propósito. `users` no lleva RLS —hay
        // que poder buscar por correo antes de saber de qué empresa es
        // nadie—, pero `persons` sí, y traerla con un `include` en la
        // misma consulta hace que Postgres evalúe la política sin
        // contexto de empresa y falle. Primero el usuario, y con su
        // empresa ya en la mano, su ficha de persona.
        const user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, status: 'activo' },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          await withTenantContext(user.companyId, (tx) =>
            tx.authLog.create({ data: { userId: user.id, eventType: 'login_failed' } })
          );
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        // Ya se conoce la empresa: la ficha de persona y las bitácoras
        // se leen y escriben con su contexto.
        const person = await withTenantContext(user.companyId, async (tx) => {
          await tx.authLog.create({ data: { userId: user.id, eventType: 'login_success' } });
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
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.companyId = (user as any).companyId;
        token.role = (user as any).role;
        token.staffPermissions = (user as any).staffPermissions;
        token.personId = (user as any).personId;
        token.isBoardMember = (user as any).isBoardMember;
        token.boardAreas = (user as any).boardAreas;
      }
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
