/**
 * Cambia el correo y/o la contraseña del usuario master.
 *
 *   MASTER_EMAIL=… MASTER_PASSWORD=… npx tsx scripts/cambiar-master.ts
 *
 * Complementa a `scripts/crear-master.ts`: aquel crea el master cuando
 * no hay ninguno y no toca nada si ya existe; este modifica el que ya
 * está. Se separaron a propósito — un guion de creación que además
 * pisara credenciales sería fácil de disparar sin querer.
 *
 * Solo hay un master en toda la plataforma (índice único parcial en
 * `prisma/sql/04_master_unico.sql`), así que no hace falta decir cuál:
 * se busca por rol. Si no hay ninguno, se detiene y remite al guion de
 * creación en vez de inventarse una empresa de plataforma.
 *
 * El correo es `citext` en Postgres y único por empresa, así que antes
 * de escribir se comprueba que el nuevo correo no esté tomado por otra
 * cuenta de la misma empresa; sin eso el error saldría como violación
 * de restricción, ilegible.
 *
 * Ambas variables son opcionales por separado: se puede cambiar solo el
 * correo o solo la contraseña. La contraseña se pasa por entorno y no
 * queda en ningún archivo — el guion se corre a mano contra la base que
 * corresponda (local con `--env-file=.env`, producción con la
 * `DIRECT_URL` de producción).
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.env.MASTER_EMAIL?.trim();
  const password = process.env.MASTER_PASSWORD;

  if (!email && !password) {
    console.error('No hay nada que cambiar: definí MASTER_EMAIL, MASTER_PASSWORD o ambas.');
    process.exit(1);
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`El correo "${email}" no tiene forma de correo.`);
    process.exit(1);
  }
  if (password && password.length < 8) {
    console.error('La contraseña del master es demasiado corta (mínimo 8 caracteres).');
    process.exit(1);
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const master = await prisma.user.findFirst({ where: { role: 'master' } });
    if (!master) {
      console.error('No hay usuario master en esta base. Creálo con scripts/crear-master.ts.');
      process.exit(1);
    }

    if (email) {
      const tomado = await prisma.user.findFirst({
        where: {
          companyId: master.companyId,
          email: { equals: email, mode: 'insensitive' },
          id: { not: master.id },
        },
        select: { id: true, role: true },
      });
      if (tomado) {
        console.error(`Ya hay otra cuenta (${tomado.role}) con el correo ${email} en esa empresa.`);
        process.exit(1);
      }
    }

    const actualizado = await prisma.user.update({
      where: { id: master.id },
      data: {
        ...(email ? { email } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      },
      select: { email: true },
    });

    if (email) console.log(`Correo del master: ${master.email} → ${actualizado.email}`);
    if (password) console.log('Contraseña del master actualizada.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('No se pudo cambiar el master:', e.message);
  process.exit(1);
});
