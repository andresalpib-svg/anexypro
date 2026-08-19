/**
 * Comprueba que la base tiene TODO lo que la aplicación da por hecho.
 *
 *   npx tsx scripts/verificar-bd.ts
 *
 * POR QUÉ EXISTE: Prisma solo gestiona las tablas. Las vistas, los
 * triggers y las políticas de Row-Level Security viven en
 * `prisma/sql/` y se aplican aparte. Durante la auditoría del 5 de
 * agosto de 2026 se comprobó que en Vercel el build era
 * `prisma generate && next build` — nada aplicaba ese SQL. Sin él la
 * aplicación **arranca igual y parece funcionar**, pero se puede
 * reservar el mismo salón dos veces y los cargos nunca pasan a
 * "pagado", así que la morosidad de los reportes queda inflada.
 *
 * Un fallo silencioso es peor que uno ruidoso: este guion sale con
 * código 1 y el despliegue se detiene.
 *
 * Sale por DIRECT_URL (el dueño): necesita leer el catálogo del sistema.
 */
import { PrismaClient } from '@prisma/client';

type Resultado = { ok: boolean; nombre: string; detalle: string };

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

const resultados: Resultado[] = [];
function anotar(ok: boolean, nombre: string, detalle: string) {
  resultados.push({ ok, nombre, detalle });
}

/**
 * Tablas que a propósito NO llevan RLS. Ninguna guarda datos de un
 * cliente concreto: o son de la plataforma, o no tienen empresa por la
 * cual filtrar. `companies` y `users` son la excepción consciente — su
 * aislamiento lo hace la aplicación, y por eso las consultas sobre
 * ellas siempre llevan `companyId` en el filtro.
 */
const SIN_RLS_A_PROPOSITO = new Set([
  'companies',
  'users',
  'service_providers', // catálogo de la plataforma, común a todas
  'subscription_plans',
  'subscription_payments',
  'job_runs',
  'fx_rates', // tipos de cambio del BCCR: referencia, sin empresa
  // Catálogos oficiales de Hacienda (tipos de identificación, tipos de
  // comprobante, condición y régimen tributario...). Son públicos y los
  // mismos para todo el país — mismo criterio que `fx_rates`. Lo que sí
  // se aísla es la configuración fiscal de cada condominio, que vive en
  // `condominium_fiscal_settings` y sí lleva RLS.
  'fiscal_catalog_entries',
  'storage_settings', // una única fila global (id = "global")
  // Freno de tasa por IP (auditoría de seguridad 2026-08-11): se
  // consulta ANTES de saber a qué empresa pertenece nadie (login,
  // /recuperar, /demo) y no guarda ningún dato de un tenant — misma
  // excepción consciente que `companies`/`users`.
  'rate_limit_hits',
  // Historial de ciclo de vida de una empresa demo (creada, vencida,
  // convertida...). Es información de PLATAFORMA que consulta el
  // master, no de un condominio de un cliente — mismo criterio que
  // `companies`, de donde cuelga (ver el modelo `DemoHistoryEntry` en
  // schema.prisma).
  'demo_history_entries',
  '_prisma_migrations',
]);

async function main() {
  // ---------- 1. Reservas: la restricción que impide el doble uso ----------
  const excl: any[] = await prisma.$queryRawUnsafe(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'reservations'::regclass AND conname = 'excl_reservation_overlap'
  `);
  anotar(
    excl.length === 1,
    'Restricción de reservas solapadas',
    excl.length === 1
      ? 'excl_reservation_overlap presente'
      : 'FALTA: se puede reservar la misma amenidad dos veces a la misma hora'
  );

  // ---------- 2. Cargos: el trigger que los marca como pagados ----------
  const trg: any[] = await prisma.$queryRawUnsafe(`
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'payment_allocations'::regclass AND tgname = 'trg_alloc_sync' AND NOT tgisinternal
  `);
  anotar(
    trg.length === 1,
    'Trigger de estado de cargos',
    trg.length === 1
      ? 'trg_alloc_sync presente'
      : 'FALTA: los cargos nunca pasan a "pagado" y la morosidad sale inflada'
  );

  // ---------- 3. Partida doble balanceada ----------
  const bal: any[] = await prisma.$queryRawUnsafe(`
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'journal_lines'::regclass AND tgname = 'trg_journal_balance' AND NOT tgisinternal
  `);
  anotar(
    bal.length === 1,
    'Trigger de asiento balanceado',
    bal.length === 1 ? 'trg_journal_balance presente' : 'FALTA: se pueden guardar asientos descuadrados'
  );

  // ---------- 4. Un solo master ----------
  const master: any[] = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE indexname = 'users_un_solo_master'`
  );
  anotar(
    master.length === 1,
    'Índice de master único',
    master.length === 1 ? 'users_un_solo_master presente' : 'FALTA: pueden existir dos usuarios master'
  );

  // ---------- 5. RLS: toda tabla con política debe estar FORZADA ----------
  // Sin FORCE, el dueño de la tabla se salta la política y el
  // aislamiento entre empresas desaparece.
  const sinForce: any[] = await prisma.$queryRawUnsafe(`
    SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relrowsecurity AND NOT c.relforcerowsecurity
      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ORDER BY c.relname
  `);
  anotar(
    sinForce.length === 0,
    'RLS forzado en todas las tablas con política',
    sinForce.length === 0
      ? 'todas forzadas'
      : `SIN FORCE (${sinForce.length}): ${sinForce.map((r) => r.relname).join(', ')}`
  );

  // ---------- 6. RLS habilitado SIN política = niega todo ----------
  // Ya pasó una vez con `storage_folders`: el módulo entero quedó
  // inaccesible sin ningún error visible.
  const sinPolitica: any[] = await prisma.$queryRawUnsafe(`
    SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    ORDER BY c.relname
  `);
  anotar(
    sinPolitica.length === 0,
    'Ninguna tabla con RLS sin política',
    sinPolitica.length === 0
      ? 'ninguna'
      : `NIEGAN TODO (${sinPolitica.length}): ${sinPolitica.map((r) => r.relname).join(', ')}`
  );

  // ---------- 7. Ninguna política permisiva sin filtro de empresa ----------
  // Postgres combina las políticas PERMISIVAS con OR: una sola sin
  // filtro anula a todas las demás de esa tabla. Fue exactamente el
  // fallo de `resident_read_documents`, que dejaba a cualquier empresa
  // leer los documentos de las otras (auditoría del 2026-08-05).
  const fugas: any[] = await prisma.$queryRawUnsafe(`
    SELECT c.relname AS tabla, p.polname AS politica
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.polpermissive
       AND COALESCE(pg_get_expr(p.polqual, p.polrelid), '') NOT LIKE '%app.current_company_id%'
     ORDER BY c.relname, p.polname
  `);
  anotar(
    fugas.length === 0,
    'Sin políticas permisivas que ignoren la empresa',
    fugas.length === 0
      ? 'ninguna'
      : `FUGA ENTRE EMPRESAS (${fugas.length}): ${fugas.map((f) => `${f.tabla}.${f.politica}`).join(', ')}`
  );

  // ---------- 8. Tablas de cliente que se quedaron sin RLS ----------
  const desprotegidas: any[] = await prisma.$queryRawUnsafe(`
    SELECT c.relname FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ORDER BY c.relname
  `);
  const inesperadas = desprotegidas.map((r) => r.relname).filter((t: string) => !SIN_RLS_A_PROPOSITO.has(t));
  anotar(
    inesperadas.length === 0,
    'Tablas de cliente con RLS',
    inesperadas.length === 0
      ? 'todas protegidas'
      : `SIN RLS (${inesperadas.length}): ${inesperadas.join(', ')}`
  );

  // ---------- 9. El rol de la aplicación no debe saltarse RLS ----------
  // Es la comprobación que más veces se ha pasado por alto: con un rol
  // superusuario o dueño de las tablas, las 83 políticas no se aplican
  // NUNCA y el aislamiento entre empresas es decorativo.
  const urlApp = process.env.DATABASE_URL ?? '';
  const usuarioEnLaUrl = /\/\/([^:]+):/.exec(urlApp)?.[1];
  // El pooler de Supabase enruta con un usuario "<rol>.<proyecto>", pero
  // el rol de Postgres es solo la primera parte: el sufijo no existe en
  // `pg_roles` y buscarlo tal cual daba un falso fallo.
  const usuarioApp = usuarioEnLaUrl?.includes('.')
    ? usuarioEnLaUrl.slice(0, usuarioEnLaUrl.indexOf('.'))
    : usuarioEnLaUrl;
  if (usuarioApp) {
    const rol: any[] = await prisma.$queryRawUnsafe(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '${usuarioApp.replace(/'/g, "''")}'`
    );
    if (rol.length === 0) {
      anotar(false, 'Rol de la aplicación', `el rol "${usuarioApp}" de DATABASE_URL no existe`);
    } else {
      const malo = rol[0].rolsuper || rol[0].rolbypassrls;
      anotar(
        !malo,
        'Rol de la aplicación sin privilegios',
        malo
          ? `"${usuarioApp}" es superusuario o tiene BYPASSRLS: las políticas NO se aplican y una empresa puede leer los datos de otra. Corregir con scripts/crear-rol-app.sql y poner ese rol en DATABASE_URL (el dueño va en DIRECT_URL).`
          : `"${usuarioApp}" sin superusuario ni BYPASSRLS`
      );

      // Dueño de las tablas: con FORCE ya no se salta las políticas,
      // pero sí puede alterar la estructura. Es un aviso, no un fallo.
      const dueño: any[] = await prisma.$queryRawUnsafe(`
        SELECT count(*)::int AS n FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_roles r ON r.oid = c.relowner
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND r.rolname = '${usuarioApp.replace(/'/g, "''")}'
      `);
      if (dueño[0]?.n > 0) {
        console.log(`  aviso: el rol de la aplicación es dueño de ${dueño[0].n} tablas (FORCE lo cubre, pero conviene separarlo).`);
      }
    }
  }

  // ---------- 10. La conexión de la APLICACIÓN funciona ----------
  //
  // Todo lo anterior se comprueba con DIRECT_URL (el dueño). Pero la
  // aplicación no usa esa conexión: usa DATABASE_URL. Si esa falla, el
  // despliegue termina bien y la aplicación arranca, pero nadie puede
  // ni iniciar sesión. Pasó de verdad: el usuario de DATABASE_URL no
  // llevaba el sufijo del proyecto que exige el pooler de Supabase y
  // toda consulta moría con `ENOIDENTIFIER`, ya en producción.
  if (urlApp) {
    const app = new PrismaClient({ datasources: { db: { url: urlApp } } });
    try {
      await app.$queryRawUnsafe('SELECT 1');
      anotar(true, 'Conexión de la aplicación (DATABASE_URL)', 'responde');
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      const pista = msg.includes('ENOIDENTIFIER')
        ? ' — el pooler de Supabase exige que el usuario sea "<rol>.<referencia-del-proyecto>", no solo "<rol>".'
        : '';
      anotar(
        false,
        'Conexión de la aplicación (DATABASE_URL)',
        `NO CONECTA${pista} La aplicación arrancaría sin poder consultar nada.`
      );
    } finally {
      await app.$disconnect();
    }
  }

  // ---------- 11. Vistas que la aplicación consulta ----------
  const vistas: any[] = await prisma.$queryRawUnsafe(`
    SELECT count(*)::int AS n FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v\\_%'
  `);
  anotar(
    (vistas[0]?.n ?? 0) > 0,
    'Vistas del esquema',
    `${vistas[0]?.n ?? 0} vistas presentes`
  );

  // ---------- Informe ----------
  console.log('\nVerificación de la base de datos\n');
  for (const r of resultados) {
    console.log(`  ${r.ok ? 'OK  ' : 'FALLA'}  ${r.nombre.padEnd(48)} ${r.detalle}`);
  }

  const fallos = resultados.filter((r) => !r.ok);
  console.log('');
  if (fallos.length > 0) {
    console.error(`${fallos.length} comprobación(es) fallaron. La base NO está lista.`);
    console.error('Aplicá el SQL con:  npm run db:sql\n');
    process.exitCode = 1;
  } else {
    console.log(`Las ${resultados.length} comprobaciones pasaron.\n`);
  }
}

main()
  .catch((e) => {
    console.error('\nNo se pudo verificar la base:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
