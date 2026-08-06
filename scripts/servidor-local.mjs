/**
 * Arranca una compilación de PRODUCCIÓN contra el entorno LOCAL.
 *
 * POR QUÉ HACE FALTA UN LANZADOR Y NO BASTA `next start`:
 *
 * En modo producción Next carga `.env.production.local` ANTES que
 * `.env`, y ese archivo es la copia de las variables de Vercel. O sea
 * que un `npm start` en esta máquina levantaba el servidor apuntando a
 * la **base de datos de producción en Supabase** y con
 * `NEXTAUTH_URL=https://app.anexypro.com`. Dos consecuencias, las dos
 * malas: el acceso fallaba con `UntrustedHost` (el servidor se creía en
 * otro dominio) y cualquier cosa que sí llegara a ejecutarse tocaba
 * datos reales de clientes desde una prueba local.
 *
 * Las variables reales del proceso GANAN sobre cualquier archivo
 * `.env*`, así que aquí se leen las del `.env` local y se inyectan
 * antes de arrancar. No se duplica ningún secreto: se reutiliza el
 * archivo que ya existe.
 *
 * Se usa desde `npm run start:local` (ver package.json).
 */
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const RAIZ = process.cwd();
const PUERTO = process.env.PORT ?? '3101';

/** Variables que DEBEN venir del entorno local, no de las de Vercel. */
const LOCALES = ['DATABASE_URL', 'DIRECT_URL', 'NEXTAUTH_URL', 'AUTH_URL', 'APP_URL'];

function leerEnv(archivo) {
  if (!existsSync(archivo)) return {};
  const salida = {};
  for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    const clave = limpia.slice(0, corte).trim();
    let valor = limpia.slice(corte + 1).trim();
    // Comillas envolventes, si las tiene.
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

const local = leerEnv(path.join(RAIZ, '.env'));
const entorno = { ...process.env, NEXT_DIST_DIR: '.next-prod' };

for (const clave of LOCALES) {
  if (local[clave]) entorno[clave] = local[clave];
}
// El puerto de esta compilación no es el del `next dev`, así que la URL
// de autenticación tiene que apuntar acá o el acceso no vuelve.
entorno.NEXTAUTH_URL = `http://localhost:${PUERTO}`;
entorno.AUTH_URL = entorno.NEXTAUTH_URL;
// Auth.js rechaza cualquier anfitrión que no reconozca; en local se le
// dice explícitamente que confíe en el que tiene delante.
entorno.AUTH_TRUST_HOST = 'true';

const baseDeDatos = (entorno.DATABASE_URL ?? '').replace(/\/\/[^@]*@/, '//…@');
console.log(`▲ Compilación de producción en http://localhost:${PUERTO}`);
console.log(`  base de datos: ${baseDeDatos || '(sin definir)'}`);
if (!/localhost|127\.0\.0\.1/.test(entorno.DATABASE_URL ?? '')) {
  console.warn('  ⚠  OJO: esta base NO es local. Revisá el .env antes de tocar nada.');
}

const hijo = spawn('npx', ['next', 'start', '-p', PUERTO], {
  cwd: RAIZ,
  env: entorno,
  stdio: 'inherit',
});
hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
