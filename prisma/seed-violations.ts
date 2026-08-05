/**
 * Catálogo inicial de incumplimientos.
 *
 * Son los nueve tipos que pidió el diseño del módulo, con un
 * escalamiento razonable de partida. Todo es editable desde la pantalla
 * de configuración: esto solo evita que el módulo arranque vacío.
 *
 *   npx tsx prisma/seed-violations.ts [condominiumId]
 *
 * Sin argumento los crea en todos los condominios que aún no tengan
 * catálogo. Es idempotente.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const CATALOGO = [
  { name: 'Ruido', description: 'Ruido que altera la tranquilidad, en especial en horario nocturno.', regulationArticle: 'Reglamento interno, capítulo de convivencia', warningsRequired: 2, daysBetween: 15, fineAmount: 25000, immediateFine: false, sortOrder: 1 },
  { name: 'Mascotas', description: 'Mascotas sueltas, sin correa o cuyos desechos no se recogen.', regulationArticle: 'Reglamento interno, capítulo de mascotas', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 2 },
  { name: 'Parqueo', description: 'Vehículos en espacios ajenos, en zonas de circulación o en áreas comunes.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 3 },
  { name: 'Basura', description: 'Residuos fuera del horario o del sitio dispuesto para su recolección.', regulationArticle: 'Reglamento interno, capítulo de aseo', warningsRequired: 2, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 4 },
  { name: 'Construcción', description: 'Obras fuera del horario permitido o sin autorización previa.', regulationArticle: 'Reglamento interno, capítulo de obras', warningsRequired: 1, daysBetween: 10, fineAmount: 50000, immediateFine: false, sortOrder: 5 },
  { name: 'Áreas comunes', description: 'Uso indebido de las áreas comunes o incumplimiento de su normativa.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 25000, immediateFine: false, sortOrder: 6 },
  { name: 'Daño a áreas comunes', description: 'Daño material a las instalaciones comunes del condominio.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 0, daysBetween: 0, fineAmount: 100000, immediateFine: true, sortOrder: 7 },
  { name: 'Modificaciones', description: 'Modificaciones a la fachada o a la estructura sin aprobación.', regulationArticle: 'Reglamento interno, capítulo de modificaciones', warningsRequired: 1, daysBetween: 15, fineAmount: 75000, immediateFine: false, sortOrder: 8 },
  { name: 'Seguridad', description: 'Incumplimiento de las normas de acceso y seguridad del condominio.', regulationArticle: 'Reglamento interno, capítulo de seguridad', warningsRequired: 1, daysBetween: 10, fineAmount: 30000, immediateFine: false, sortOrder: 9 },
  { name: 'Otros', description: 'Otros incumplimientos del reglamento no contemplados en las categorías anteriores.', regulationArticle: null, warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 10 },
];

async function main() {
  const objetivo = process.argv[2];
  const condos = await prisma.condominium.findMany({
    where: { deletedAt: null, ...(objetivo ? { id: objetivo } : {}) },
    select: { id: true, name: true },
  });

  if (condos.length === 0) {
    console.log('No hay condominios que sembrar.');
    return;
  }

  for (const condo of condos) {
    let creados = 0;
    for (const t of CATALOGO) {
      const existe = await prisma.violationType.findFirst({
        where: { condominiumId: condo.id, name: t.name },
        select: { id: true },
      });
      if (existe) continue;
      await prisma.violationType.create({ data: { condominiumId: condo.id, ...t } });
      creados += 1;
    }

    // Ajustes del documento, si el condominio no los tiene.
    const ajustes = await prisma.violationSettings.findUnique({ where: { condominiumId: condo.id } });
    if (!ajustes) {
      await prisma.violationSettings.create({
        data: {
          condominiumId: condo.id,
          headerText: 'Administración del condominio',
          footerText: 'Documento emitido electrónicamente por ANEXYpro.',
          signerTitle: 'Administración',
          responseDays: 8,
        },
      });
    }

    console.log(`${condo.name}: ${creados} tipo(s) creado(s)${ajustes ? '' : ' · ajustes iniciales'}`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
