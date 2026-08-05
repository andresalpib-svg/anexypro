/**
 * Deja la base lista para que la aplicación arranque: migraciones,
 * SQL complementario y verificación, en ese orden.
 *
 *   npx tsx scripts/desplegar-bd.ts
 *
 * Es lo que corre el despliegue antes de compilar (ver `package.json`
 * → `vercel-build`). Antes de la auditoría del 5 de agosto de 2026 el
 * build era `prisma generate && next build`: no aplicaba las
 * migraciones NI el SQL de `prisma/sql/`, así que la restricción que
 * impide reservar dos veces la misma amenidad y el trigger que marca
 * los cargos como pagados sencillamente no existían en producción. La
 * aplicación arrancaba igual — ese es el problema.
 *
 * Los tres pasos:
 *   1. `prisma migrate deploy` — las tablas.
 *   2. Los archivos de `prisma/sql/` EN ORDEN — vistas, triggers,
 *      políticas de RLS. Son idempotentes: se reaplican en cada
 *      despliegue a propósito, porque así un cambio en una política
 *      viaja con el código que lo necesita.
 *   3. `scripts/verificar-bd.ts` — comprueba el resultado. Si algo
 *      falta, el despliegue se detiene en vez de publicar una versión
 *      que cobra mal.
 *
 * Todo con DIRECT_URL: crear tablas y políticas es trabajo del dueño,
 * no del rol de la aplicación (que a propósito no puede tocar la
 * estructura).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const DIR_SQL = path.join(RAIZ, 'prisma', 'sql');

/**
 * En Vercel las variables llegan del entorno; en local viven en `.env`,
 * que Prisma carga solo dentro de sus propios clientes. Este guion las
 * necesita ANTES de llamar a nada, así que las lee él mismo. No pisa
 * lo que ya venga del entorno: en producción manda el entorno.
 */
function cargarEnvLocal() {
  for (const nombre of ['.env.local', '.env']) {
    const ruta = path.join(RAIZ, nombre);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linea);
      if (!m) continue;
      const clave = m[1] ?? '';
      if (!clave || process.env[clave] !== undefined) continue;
      let valor = (m[2] ?? '').trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      process.env[clave] = valor;
    }
  }
}

function paso(titulo: string) {
  console.log(`\n──── ${titulo}`);
}

function correr(comando: string, args: string[]) {
  execFileSync(comando, args, { stdio: 'inherit', cwd: RAIZ });
}

function main() {
  cargarEnvLocal();

  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (y DIRECT_URL para las migraciones).');
    process.exit(1);
  }
  if (!process.env.DIRECT_URL) {
    console.warn(
      'Aviso: no hay DIRECT_URL. Se usará DATABASE_URL para migrar, que suele ser\n' +
        'el rol de la aplicación y no tiene permiso para alterar la estructura.'
    );
  }

  paso('1/5 Reconciliar el registro de migraciones');
  // Una migración se renombró para corregir su orden; si la base ya la
  // tenía con el nombre viejo, Prisma intentaría aplicarla dos veces.
  correr('npx', ['tsx', path.join('scripts', 'reconciliar-migraciones.ts')]);

  paso('2/5 Migraciones de Prisma');
  correr('npx', ['prisma', 'migrate', 'deploy']);

  paso('3/5 SQL complementario (vistas, triggers, RLS)');
  // Orden alfabético = el orden numerado de los archivos (01…05), que
  // es el orden en que tienen que aplicarse: el 03 endurece lo que
  // creó el 02.
  const archivos = readdirSync(DIR_SQL)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (archivos.length === 0) {
    console.error(`No se encontró ningún .sql en ${DIR_SQL}`);
    process.exit(1);
  }
  for (const archivo of archivos) {
    console.log(`\n  → ${archivo}`);
    correr('npx', ['tsx', path.join('scripts', 'aplicar-sql.ts'), path.join('prisma', 'sql', archivo)]);
  }

  // ---------- Cuenta inicial ----------
  //
  // `prisma/seed.ts` crea la empresa, su administrador y el catálogo de
  // cuentas contables. No hace nada si ya existe una empresa, así que
  // se puede dejar en el despliegue: solo actúa sobre una base recién
  // creada.
  //
  // Se exige `SEED_ADMIN_PASSWORD` a propósito. Sin ella el sembrado
  // usa una contraseña conocida y escrita en el repositorio; crear con
  // ella el administrador de producción sería dejar la puerta abierta.
  if (process.env.SEED_ADMIN_PASSWORD) {
    paso('4/5 Cuenta inicial (solo si la base está vacía)');
    correr('npx', ['tsx', path.join('prisma', 'seed.ts')]);
  } else {
    paso('4/5 Cuenta inicial — omitida');
    console.log(
      '  No hay SEED_ADMIN_PASSWORD definida, así que no se crea ninguna cuenta.\n' +
        '  Es lo correcto salvo que la base esté vacía: en ese caso definí\n' +
        '  SEED_ADMIN_PASSWORD (y SEED_ADMIN_EMAIL / SEED_COMPANY_NAME) y volvé a desplegar.'
    );
  }

  paso('5/5 Verificación');
  correr('npx', ['tsx', path.join('scripts', 'verificar-bd.ts')]);

  console.log('\nBase de datos lista.\n');
}

main();
