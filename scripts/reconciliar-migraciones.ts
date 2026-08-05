/**
 * Pone al día el registro de migraciones cuando una carpeta se renombra.
 *
 * POR QUÉ EXISTE: `20260719230128_asset_amenity_attachments` ordenaba
 * ANTES que `20260720024752_init`, que es la que crea las tablas. En una
 * base vacía —producción— `prisma migrate deploy` moría en la primera
 * migración con «relation "amenities" does not exist». Se renombró a
 * `20260720030000_asset_amenity_attachments` para que caiga después.
 *
 * El problema del renombrado: en una base donde YA se aplicó con el
 * nombre viejo, Prisma ve el nombre nuevo como pendiente e intenta
 * aplicarlo otra vez, y falla porque las columnas ya existen. Este
 * guion cambia el nombre en la bitácora `_prisma_migrations` para que
 * coincida con la carpeta.
 *
 * Es idempotente y no toca datos: solo la tabla de control de Prisma.
 * En una base nueva no hace nada.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const RENOMBRADAS: Array<{ viejo: string; nuevo: string }> = [
  {
    viejo: '20260719230128_asset_amenity_attachments',
    nuevo: '20260720030000_asset_amenity_attachments',
  },
];

/**
 * Migraciones que SÍ deben aplicarse aunque se establezca la línea base.
 *
 * Al dar por aplicada la historia de una base que se creó sin
 * migraciones, hay que dejar fuera las que traen cambios que esa base
 * todavía no tiene. Aquí solo los índices de rendimiento, que son
 * posteriores a la creación del esquema de producción.
 */
const APLICAR_AUNQUE_HAYA_LINEA_BASE = new Set(['20260805_indices_rendimiento']);

const RAIZ = path.resolve(__dirname, '..');

/**
 * La base tiene tablas pero ninguna bitácora de migraciones: se creó
 * con `prisma db push` o aplicando SQL a mano. Es el caso de producción
 * (comprobado en el despliegue del 5 de agosto de 2026, error P3005).
 *
 * Se marcan como aplicadas todas las migraciones que ese esquema ya
 * refleja, para que `migrate deploy` no intente recrear tablas que
 * existen. Las de `APLICAR_AUNQUE_HAYA_LINEA_BASE` se dejan pendientes
 * a propósito.
 */
function establecerLineaBase() {
  const dir = path.join(RAIZ, 'prisma', 'migrations');
  const migraciones = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let marcadas = 0;
  for (const nombre of migraciones) {
    if (APLICAR_AUNQUE_HAYA_LINEA_BASE.has(nombre)) {
      console.log(`  ${nombre}: se deja PENDIENTE (trae cambios que la base no tiene).`);
      continue;
    }
    execFileSync('npx', ['prisma', 'migrate', 'resolve', '--applied', nombre], {
      stdio: 'pipe',
      cwd: RAIZ,
    });
    marcadas++;
  }
  console.log(`  línea base establecida: ${marcadas} migración(es) dadas por aplicadas.`);
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DIRECT_URL / DATABASE_URL.');
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const existe: any[] = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS hay`
    );
    if (!existe[0]?.hay) {
      // ¿Está realmente vacía, o solo le falta la bitácora?
      const tablas: any[] = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      );
      if ((tablas[0]?.n ?? 0) === 0) {
        console.log('  base vacía: las migraciones se aplicarán desde cero.');
        return;
      }
      console.log(`  la base tiene ${tablas[0].n} tablas pero ningún historial de migraciones.`);
      establecerLineaBase();
      return;
    }

    for (const { viejo, nuevo } of RENOMBRADAS) {
      // Si ya está el nombre nuevo, no hay nada que hacer. Si estuvieran
      // los dos, se borra el viejo: el nuevo es el que manda.
      const filas: any[] = await prisma.$queryRawUnsafe(
        `SELECT migration_name FROM _prisma_migrations WHERE migration_name IN ($1, $2)`,
        viejo,
        nuevo
      );
      const nombres = filas.map((f) => f.migration_name);

      if (nombres.includes(nuevo) && nombres.includes(viejo)) {
        await prisma.$executeRawUnsafe(`DELETE FROM _prisma_migrations WHERE migration_name = $1`, viejo);
        console.log(`  ${viejo} -> duplicado eliminado (ya existía ${nuevo}).`);
      } else if (nombres.includes(viejo)) {
        await prisma.$executeRawUnsafe(
          `UPDATE _prisma_migrations SET migration_name = $1 WHERE migration_name = $2`,
          nuevo,
          viejo
        );
        console.log(`  ${viejo} -> renombrada a ${nuevo}.`);
      } else {
        console.log(`  ${nuevo}: nada que reconciliar.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('No se pudo reconciliar el registro de migraciones:', e.message);
  process.exit(1);
});
