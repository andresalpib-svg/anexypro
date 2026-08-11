/**
 * Ajusta el catálogo de incumplimientos ya sembrado en los condominios
 * existentes al set de diez botones que pidió la administración
 * (`seed-violations.ts` ya trae este set para condominios nuevos — este
 * script pone al día los que se sembraron con el catálogo anterior).
 *
 * Tres movimientos, todos preservando el historial:
 *   1. Renombra los tipos que son el mismo concepto con nombre nuevo
 *      (Ruido → Ruidos, Mascotas → Perro Suelto, Parqueo → Vehículo mal
 *      estacionado, Basura → Basura visible). Conserva el id, así que
 *      los expedientes existentes no pierden su tipo.
 *   2. Crea los tipos del set nuevo que todavía no existan.
 *   3. Desactiva (no borra) los tipos del catálogo anterior que ya no
 *      están en el set pedido — dejan de aparecer como botón pero su
 *      historial y expedientes siguen intactos.
 *
 * Un tipo que la administración ya editó a mano (nombre distinto al de
 * partida) no lo toca este script.
 *
 *   npx tsx prisma/sync-violations-catalog.ts [condominiumId]
 *
 * Idempotente: correrlo dos veces no cambia nada la segunda vez.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const RENOMBRES: Record<string, string> = {
  Ruido: 'Ruidos',
  Mascotas: 'Perro Suelto',
  Parqueo: 'Vehículo mal estacionado',
  Basura: 'Basura visible',
};

const NUEVOS = [
  { name: 'Objetos en cochera', description: 'Objetos almacenados en la cochera que no corresponden o que obstruyen la circulación.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 2, daysBetween: 15, fineAmount: 15000, immediateFine: false, sortOrder: 4 },
  { name: 'Uso indebido del parqueo de visitas', description: 'Parqueo de visitas ocupado por un residente o por más tiempo del permitido.', regulationArticle: 'Reglamento interno, capítulo de parqueos', warningsRequired: 1, daysBetween: 10, fineAmount: 15000, immediateFine: false, sortOrder: 5 },
  { name: 'Mal uso de Casa Club', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la Casa Club.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 6 },
  { name: 'Mal uso de Gym', description: 'Incumplimiento de la normativa de horario, aforo o equipo del gimnasio.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 7 },
  { name: 'Mal uso de piscina', description: 'Incumplimiento de la normativa de horario, aforo o normas de seguridad de la piscina.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 1, daysBetween: 10, fineAmount: 25000, immediateFine: false, sortOrder: 8 },
  { name: 'Mal uso de la cancha', description: 'Incumplimiento de la normativa de reserva, horario o aforo de la cancha.', regulationArticle: 'Reglamento interno, capítulo de áreas comunes', warningsRequired: 2, daysBetween: 15, fineAmount: 20000, immediateFine: false, sortOrder: 9 },
];

const SET_PEDIDO = new Set([
  'Ruidos', 'Perro Suelto', 'Vehículo mal estacionado', 'Objetos en cochera',
  'Uso indebido del parqueo de visitas', 'Mal uso de Casa Club', 'Mal uso de Gym',
  'Mal uso de piscina', 'Mal uso de la cancha', 'Basura visible',
]);

// Tipos del catálogo anterior que no están en el set pedido: se
// desactivan si nadie los renombró antes (ver RENOMBRES).
const A_DESACTIVAR = ['Construcción', 'Áreas comunes', 'Daño a áreas comunes', 'Modificaciones', 'Seguridad', 'Otros'];

async function main() {
  const objetivo = process.argv[2];
  const condos = await prisma.condominium.findMany({
    where: { deletedAt: null, ...(objetivo ? { id: objetivo } : {}) },
    select: { id: true, name: true },
  });

  if (condos.length === 0) {
    console.log('No hay condominios que ajustar.');
    return;
  }

  for (const condo of condos) {
    const tipos = await prisma.violationType.findMany({ where: { condominiumId: condo.id } });
    let renombrados = 0;
    let creados = 0;
    let desactivados = 0;

    for (const [antes, despues] of Object.entries(RENOMBRES)) {
      const existeAntes = tipos.find((t) => t.name === antes && t.isActive);
      const existeDespues = tipos.some((t) => t.name === despues);
      if (!existeAntes) continue;
      if (!existeDespues) {
        // No hay tipo con el nombre nuevo todavía: renombrar conserva
        // el id y el historial.
        await prisma.violationType.update({ where: { id: existeAntes.id }, data: { name: despues } });
        renombrados += 1;
      } else {
        // Ya existe el de nombre nuevo (por ejemplo, sembrado aparte):
        // el de nombre viejo queda duplicado — se desactiva, no se
        // borra, porque puede tener expedientes.
        await prisma.violationType.update({ where: { id: existeAntes.id }, data: { isActive: false } });
        desactivados += 1;
      }
    }

    for (const t of NUEVOS) {
      const existe = tipos.some((x) => x.name === t.name) || (await prisma.violationType.findFirst({ where: { condominiumId: condo.id, name: t.name } }));
      if (existe) continue;
      await prisma.violationType.create({ data: { condominiumId: condo.id, ...t } });
      creados += 1;
    }

    for (const nombre of A_DESACTIVAR) {
      const t = tipos.find((x) => x.name === nombre && x.isActive);
      if (!t) continue;
      await prisma.violationType.update({ where: { id: t.id }, data: { isActive: false } });
      desactivados += 1;
    }

    if (renombrados || creados || desactivados) {
      console.log(`${condo.name}: ${renombrados} renombrado(s), ${creados} creado(s), ${desactivados} desactivado(s)`);
    } else {
      console.log(`${condo.name}: sin cambios`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
