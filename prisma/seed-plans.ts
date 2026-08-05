/**
 * Planes de suscripción iniciales.
 *
 * Son un punto de partida editable desde `/master/suscripciones`: los
 * precios y los topes los define el negocio, no el código. Esto solo
 * evita que la pantalla arranque vacía y no se pueda asignar
 * suscripción a nadie.
 *
 *   npx tsx prisma/seed-plans.ts
 *
 * Idempotente.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const PLANES = [
  {
    name: 'Básico',
    description: 'Para administradoras que llevan un condominio.',
    price: 35000,
    period: 'mensual' as const,
    maxCondominiums: 1,
    graceDays: 5,
    sortOrder: 1,
  },
  {
    name: 'Profesional',
    description: 'Hasta cinco condominios, con todos los módulos.',
    price: 90000,
    period: 'mensual' as const,
    maxCondominiums: 5,
    graceDays: 5,
    sortOrder: 2,
  },
  {
    name: 'Corporativo',
    description: 'Sin tope de condominios.',
    price: 180000,
    period: 'mensual' as const,
    maxCondominiums: 0,
    graceDays: 5,
    sortOrder: 3,
  },
  {
    name: 'Profesional Anual',
    description: 'Mismo alcance que el Profesional, con pago anual.',
    price: 900000,
    period: 'anual' as const,
    maxCondominiums: 5,
    graceDays: 5,
    sortOrder: 4,
  },
];

async function main() {
  let creados = 0;
  for (const p of PLANES) {
    const existe = await prisma.subscriptionPlan.findUnique({ where: { name: p.name } });
    if (existe) continue;
    await prisma.subscriptionPlan.create({ data: { ...p, currency: 'CRC' } });
    creados++;
  }
  console.log(`Planes creados: ${creados} (de ${PLANES.length})`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
