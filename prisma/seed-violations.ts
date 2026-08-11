/**
 * Catálogo inicial de incumplimientos.
 *
 * Los diez botones que pidió la administración para que el paso 2 no
 * arranque vacío en ningún condominio, con un escalamiento razonable de
 * partida. Todo es editable desde la pantalla de configuración
 * (`/app/incumplimientos/configuracion`), que además permite agregar
 * más tipos con la misma configuración — esto solo pone la base.
 *
 *   npx tsx prisma/seed-violations.ts [condominiumId]
 *
 * Sin argumento los crea en todos los condominios que aún no tengan
 * catálogo. Es idempotente: si el condominio ya tiene un tipo con ese
 * nombre, no lo toca — así no pisa lo que la administración ya
 * personalizó.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const CATALOGO = [
  { name: 'Ruidos', description: 'Ruido que altera la tranquilidad, en especial en horario nocturno.', regulationArticle: 'Reglamento interno, capítulo de convivencia', warningsRequired: 2, daysBetween: 15, fineAmount: 25000, immediateFine: false, sortOrder: 1 },
  { name: 'Perro Suelto', description: 'Mascotas sueltas, sin correa o cuyos desechos no se recogen.', regulationArticle: 'Reglamento interno, capítulo de mascotas', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 2 },
  { name: 'Vehículo mal estacionado', description: 'Vehículo en espacio ajeno, en zona de circulación o en área común.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 3 },
  { name: 'Objetos en cochera', description: 'Objetos almacenados en la cochera que no corresponden o que obstruyen la circulación.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 2, daysBetween: 15, fineAmount: 15000, immediateFine: false, sortOrder: 4 },
  { name: 'Uso indebido del parqueo de visitas', description: 'Parqueo de visitas ocupado por un residente o por más tiempo del permitido.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 5 },
  { name: 'Mal uso de Casa Club', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la Casa Club.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 6 },
  { name: 'Mal uso de Gym', description: 'Incumplimiento de la normativa de horario, aforo o equipo del gimnasio.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 7 },
  { name: 'Mal uso de piscina', description: 'Incumplimiento de la normativa de horario, aforo o normas de seguridad de la piscina.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 1, daysBetween: 10, fineAmount: 25000, immediateFine: false, sortOrder: 8 },
  { name: 'Mal uso de la cancha', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la cancha.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 9 },
  { name: 'Basura visible', description: 'Residuos fuera del horario o del sitio dispuesto para su recolección.', regulationArticle: 'Reglamento interno, capítulo de aseo', warningsRequired: 2, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 10 },
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
