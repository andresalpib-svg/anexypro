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
import {
  TIPOS_INCUMPLIMIENTO_INICIALES as CATALOGO,
  AJUSTES_INCUMPLIMIENTO_INICIALES,
} from '../src/lib/domain/catalogos-iniciales';

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
        data: { condominiumId: condo.id, ...AJUSTES_INCUMPLIMIENTO_INICIALES },
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
