/**
 * Deja el historial de migraciones y el esquema en un estado coherente
 * antes de `prisma migrate deploy`.
 *
 * POR QUÉ EXISTE: la base de producción no se creó con migraciones.
 * Se comprobó desplegando el 5 de agosto de 2026:
 *
 *  1. No tenía la tabla `_prisma_migrations` pero sí 97 tablas
 *     (`migrate deploy` aborta con P3005 sobre una base no vacía).
 *  2. Y su esquema está INCOMPLETO: le faltan tablas que el modelo
 *     declara —`condominium_supervisors` entre otras—, porque se generó
 *     con `db push` desde una versión anterior de `schema.prisma`.
 *
 * O sea que no basta con dar la historia por aplicada: hay que poner el
 * esquema al día primero. Para eso está `db push`, que crea lo que
 * falta. Se ejecuta **sin `--accept-data-loss`**, así que si algún
 * cambio exigiera borrar datos, falla en vez de destruirlos.
 *
 * Tres caminos:
 *  - Base vacía            → no hace nada; `migrate deploy` la construye.
 *  - Esquema al día        → solo resuelve renombrados de carpeta.
 *  - Esquema incompleto o
 *    sin historia fiable   → `db push` + dar toda la historia por aplicada.
 *
 * Nunca toca datos: solo estructura y la bitácora de control de Prisma.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

const RENOMBRADAS: Array<{ viejo: string; nuevo: string }> = [
  {
    viejo: '20260719230128_asset_amenity_attachments',
    nuevo: '20260720030000_asset_amenity_attachments',
  },
];

const RAIZ = path.resolve(__dirname, '..');

function migracionesEnDisco(): string[] {
  return readdirSync(path.join(RAIZ, 'prisma', 'migrations'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function correr(args: string[]) {
  execFileSync('npx', args, { stdio: 'inherit', cwd: RAIZ });
}

/** Tablas que el modelo declara, con el nombre real que llevan en la base. */
function tablasDelModelo(): string[] {
  return Prisma.dmmf.datamodel.models.map((m) => m.dbName ?? m.name);
}

/**
 * Pone el esquema al día y da toda la historia por aplicada.
 *
 * `db push` crea lo que falte a partir de `schema.prisma`. Después, las
 * migraciones se marcan como aplicadas —incluidas las que `db push`
 * acaba de materializar— para que a partir de ahora el historial sirva
 * y los cambios siguientes viajen como migraciones normales.
 */
function adoptarEsquema() {
  console.log('  poniendo el esquema al día con `prisma db push`…');
  // Sin --accept-data-loss a propósito: preferimos fallar a borrar datos.
  correr(['prisma', 'db', 'push', '--skip-generate']);

  let marcadas = 0;
  for (const nombre of migracionesEnDisco()) {
    try {
      execFileSync('npx', ['prisma', 'migrate', 'resolve', '--applied', nombre], {
        stdio: 'pipe',
        cwd: RAIZ,
      });
      marcadas++;
    } catch {
      // Ya estaba marcada como aplicada: es el resultado que queremos.
    }
  }
  console.log(`  historial normalizado: ${marcadas} migración(es) marcadas.`);
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DIRECT_URL / DATABASE_URL.');
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const hayBitacora: any[] = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS hay`
    );

    const cuantasTablas: any[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const baseVacia = (cuantasTablas[0]?.n ?? 0) === 0;

    if (baseVacia) {
      console.log('  base vacía: las migraciones la construyen desde cero.');
      return;
    }

    // ---------- ¿Quedó alguna migración a medias? ----------
    // Una migración fallida bloquea TODO `migrate deploy` (P3018) hasta
    // que se resuelva, así que se marca como revertida antes de nada.
    if (hayBitacora[0]?.hay) {
      const fallidas: any[] = await prisma.$queryRawUnsafe(
        `SELECT migration_name FROM _prisma_migrations
          WHERE finished_at IS NULL AND rolled_back_at IS NULL`
      );
      for (const f of fallidas) {
        console.log(`  ${f.migration_name}: quedó a medias, se marca como revertida.`);
        try {
          execFileSync('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', f.migration_name], {
            stdio: 'pipe',
            cwd: RAIZ,
          });
        } catch {
          // Si Prisma no la reconoce, `db push` la deja sin efecto igual.
        }
      }
    }

    // ---------- ¿Está el esquema completo? ----------
    const existentes: any[] = await prisma.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const enBase = new Set(existentes.map((t) => t.table_name));
    const faltan = tablasDelModelo().filter((t) => !enBase.has(t));

    if (faltan.length > 0) {
      console.log(
        `  al esquema le faltan ${faltan.length} tabla(s): ${faltan.slice(0, 6).join(', ')}${
          faltan.length > 6 ? '…' : ''
        }`
      );
      adoptarEsquema();
      return;
    }

    if (!hayBitacora[0]?.hay) {
      console.log('  el esquema está completo pero no hay historial de migraciones.');
      adoptarEsquema();
      return;
    }

    // ---------- Camino normal: solo renombrados ----------
    for (const { viejo, nuevo } of RENOMBRADAS) {
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
  console.error('No se pudo reconciliar el estado de la base:', e.message);
  process.exit(1);
});
