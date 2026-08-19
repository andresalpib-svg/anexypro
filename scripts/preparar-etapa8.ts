/**
 * Banco de pruebas de la ETAPA 8 — seguridad, permisos y auditoría.
 *
 *   npx tsx --env-file=.env scripts/preparar-etapa8.ts
 *
 * Crea (o pone al día) un usuario por rol con clave conocida, para
 * poder atacar la aplicación por HTTP como lo haría cada uno. El
 * supervisor queda asignado a UN SOLO condominio a propósito: es el
 * caso que revela si el backend valida "usuario + condominio", o si se
 * conforma con que el id venga en el formulario.
 *
 * Idempotente. Solo toca usuarios cuyo correo termina en `@etapa8.test`.
 */
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma, withTenantContext } from '../src/lib/db';

export const CLAVE = 'Etapa8Auditoria!2026';

/** Empresa 1: la de los condominios de prueba de la Etapa 7. */
export const EMPRESA_1 = '4c2bbca0-3648-41b1-8924-de589805c962';
export const CONDO_A = 'e5f326ea-b893-4de1-b68a-71f722525625';
export const CONDO_B = 'df207403-5f2d-46ba-947d-f0665917e16e';

export const USUARIOS = [
  { email: 'owner@etapa8.test', role: 'admin_owner', fullName: 'Auditoría — Administrador', condos: [] as string[] },
  // Supervisor con acceso SOLO al condominio A.
  { email: 'supervisor-a@etapa8.test', role: 'admin_staff', fullName: 'Auditoría — Supervisor de A', condos: [CONDO_A] },
  { email: 'contador@etapa8.test', role: 'contador', fullName: 'Auditoría — Contador externo', condos: [] },
  { email: 'condomino@etapa8.test', role: 'condomino', fullName: 'Auditoría — Condómino', condos: [] },
  { email: 'guarda@etapa8.test', role: 'seguridad', fullName: 'Auditoría — Oficial de caseta', condos: [CONDO_A] },
] as const;

async function main() {
  const hash = await bcrypt.hash(CLAVE, 12);

  for (const u of USUARIOS) {
    const existente = await prisma.user.findFirst({ where: { companyId: EMPRESA_1, email: u.email } });
    const user = existente
      ? await prisma.user.update({
          where: { id: existente.id },
          // `null`, no `undefined`: en Prisma `undefined` significa "no toques
          // este campo", así que volver a correr el guion no limpiaba una
          // grilla de permisos dejada a medias por una prueba anterior.
          data: { passwordHash: hash, role: u.role as any, status: 'activo', staffPermissions: Prisma.DbNull },
        })
      : await prisma.user.create({
          data: {
            companyId: EMPRESA_1,
            email: u.email,
            passwordHash: hash,
            fullName: u.fullName,
            role: u.role as any,
            status: 'activo',
          },
        });

    await withTenantContext(EMPRESA_1, async (tx) => {
      await tx.condominiumSupervisor.deleteMany({ where: { userId: user.id } });
      for (const condominiumId of u.condos) {
        await tx.condominiumSupervisor.create({ data: { condominiumId, userId: user.id } });
      }
    });

    console.log(`  ${u.role.padEnd(12)} ${u.email}  condominios: ${u.condos.length ? 'A' : '(todos / n. a.)'}`);
  }

  console.log(`\nClave para todos: ${CLAVE}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
