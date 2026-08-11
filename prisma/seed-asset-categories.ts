/**
 * Catálogo inicial de categorías de activos.
 *
 * Las siete de partida (Elevador, Bomba, Generador, Piscina, Portón,
 * Techo, Otro) para que el selector de "Categoría" al crear un activo
 * no arranque vacío en un condominio nuevo — la migración
 * `20260811_asset_categorias` ya las sembró en los que existían en ese
 * momento. Todo es editable desde "Editar más opciones" en el mismo
 * selector.
 *
 *   npx tsx prisma/seed-asset-categories.ts [condominiumId]
 *
 * Sin argumento los crea en todos los condominios que aún no tengan
 * catálogo. Es idempotente.
 */
import { PrismaClient } from '@prisma/client';
import { CATEGORIAS_ACTIVO_INICIALES as CATALOGO } from '../src/lib/domain/catalogos-iniciales';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

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
    const existe = await prisma.assetCategoryOption.findFirst({ where: { condominiumId: condo.id }, select: { id: true } });
    if (existe) {
      console.log(`${condo.name}: ya tiene catálogo.`);
      continue;
    }
    await prisma.assetCategoryOption.createMany({
      data: CATALOGO.map((c) => ({ condominiumId: condo.id, ...c })),
    });
    console.log(`${condo.name}: ${CATALOGO.length} categoría(s) creada(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
