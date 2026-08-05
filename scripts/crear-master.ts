/**
 * Crea el usuario master de la plataforma.
 *
 *   MASTER_EMAIL=… MASTER_PASSWORD=… npx tsx scripts/crear-master.ts
 *
 * El master es el dueño de la plataforma: ve todas las empresas
 * administradoras, las da de alta junto con su primer administrador, y
 * puede crear cualquier tipo de usuario. Solo puede existir UNO — lo
 * garantiza un índice único parcial (`prisma/sql/04_master_unico.sql`).
 *
 * POR QUÉ NO SIRVE `prisma/seed.ts`: ese crea una empresa con un
 * usuario `admin_owner`, que es el acceso de una empresa cliente. Para
 * arrancar la plataforma hace falta el master, que es otra cosa.
 *
 * SOBRE LA EMPRESA DEL MASTER: `User.companyId` es obligatorio en el
 * modelo, así que el master necesita una. Se le crea una propia —de
 * plataforma, sin condominios— en vez de colgarlo de una empresa
 * cliente: colgarlo de una cliente mezclaría al dueño de la plataforma
 * con un inquilino, y lo dejaría expuesto a cosas como el bloqueo por
 * suscripción.
 *
 * Es idempotente: si ya hay un master, no hace nada.
 *
 * La contraseña se pasa por entorno y no se guarda en ningún sitio: el
 * guion se corre una vez, a mano, contra la base que corresponda.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

async function main() {
  const email = process.env.MASTER_EMAIL;
  const password = process.env.MASTER_PASSWORD;
  const empresaNombre = process.env.MASTER_COMPANY_NAME ?? 'ANEXYpro (plataforma)';

  if (!email || !password) {
    console.error('Hacen falta MASTER_EMAIL y MASTER_PASSWORD.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('La contraseña del master es demasiado corta.');
    process.exit(1);
  }

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const yaHay = await prisma.user.findFirst({ where: { role: 'master' } });
    if (yaHay) {
      console.log(`Ya existe un usuario master (${yaHay.email}). No se crea otro.`);
      return;
    }

    // ¿Tiene ya su empresa de plataforma de un intento anterior?
    let empresa = await prisma.company.findFirst({ where: { legalName: empresaNombre } });
    if (!empresa) {
      empresa = await prisma.company.create({ data: { legalName: empresaNombre } });
      console.log(`Empresa de plataforma creada: ${empresa.legalName}`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const master = await prisma.user.create({
      data: {
        companyId: empresa.id,
        email,
        passwordHash,
        fullName: 'Usuario Master',
        role: 'master',
        status: 'activo',
      },
    });

    console.log(`Usuario master creado: ${master.email}`);
    console.log('Desde /master puede dar de alta empresas con su primer administrador.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('No se pudo crear el master:', e.message);
  process.exit(1);
});
