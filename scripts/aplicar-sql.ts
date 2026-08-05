/**
 * Aplica un archivo de `prisma/sql/` contra la base.
 *
 *   npx tsx scripts/aplicar-sql.ts prisma/sql/03_rls_endurecido.sql
 *
 * Esos archivos no son migraciones de Prisma: se aplican aparte. Hasta
 * ahora se corrían a mano y esta máquina no tiene `psql`, así que el
 * paso quedaba sin herramienta.
 *
 * Corta por `;` respetando los bloques `$$ … $$`, los comentarios y las
 * cadenas: en todos ellos el punto y coma es contenido, no un
 * separador. Los comentarios de este proyecto están escritos en español
 * y llevan punto y coma con normalidad.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

function sentencias(sql: string): string[] {
  const out: string[] = [];
  let actual = '';
  let dolar: string | null = null;
  let comentario: 'linea' | 'bloque' | null = null;
  let cadena = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (comentario === 'linea') {
      actual += c;
      if (c === '\n') comentario = null;
      continue;
    }
    if (comentario === 'bloque') {
      actual += c;
      if (c === '/' && sql[i - 1] === '*') comentario = null;
      continue;
    }
    if (cadena) {
      actual += c;
      if (c === "'") cadena = false;
      continue;
    }
    if (dolar === null && c === '-' && sql[i + 1] === '-') {
      comentario = 'linea';
      actual += c;
      continue;
    }
    if (dolar === null && c === '/' && sql[i + 1] === '*') {
      comentario = 'bloque';
      actual += c;
      continue;
    }
    if (dolar === null && c === "'") {
      cadena = true;
      actual += c;
      continue;
    }

    // ¿empieza o termina un bloque $etiqueta$?
    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        if (dolar === null) dolar = m[0];
        else if (dolar === m[0]) dolar = null;
        actual += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === ';' && dolar === null) {
      if (actual.trim()) out.push(actual.trim());
      actual = '';
      continue;
    }
    actual += c;
  }
  if (actual.trim()) out.push(actual.trim());

  // Fuera comentarios sueltos que no ejecutan nada.
  return out.filter((s) => s.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
}

async function main() {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: npx tsx scripts/aplicar-sql.ts <archivo.sql>');
    process.exit(1);
  }

  // Estos archivos crean políticas, índices y roles: es trabajo del
  // DUEÑO de las tablas (DIRECT_URL), no del rol de la aplicación, que
  // a propósito no puede tocar la estructura.
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const lista = sentencias(readFileSync(archivo, 'utf8'));
  console.log(`${archivo}: ${lista.length} sentencias`);

  let ok = 0;
  try {
    for (const s of lista) {
      const resumen = s.replace(/\s+/g, ' ').slice(0, 70);
      try {
        await prisma.$executeRawUnsafe(s);
        ok++;
      } catch (e: any) {
        console.error(`\n  FALLÓ: ${resumen}…`);
        console.error(`  ${e.message.split('\n').slice(0, 3).join(' ')}`);
        throw e;
      }
    }
    console.log(`Aplicadas ${ok}/${lista.length}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
