/**
 * ATAQUE ETAPA 8 — se intenta entrar por donde no se debe.
 *
 *   npm run dev            (en otra terminal)
 *   npx tsx --env-file=.env scripts/preparar-etapa8.ts
 *   node scripts/atacar-etapa8.mjs
 *
 * Inicia sesión como cada rol y golpea las rutas del servidor con
 * parámetros que el frontend nunca mandaría: el condominio de otro, el
 * módulo que no le toca, el identificador ajeno. No usa el navegador a
 * propósito — el punto es justamente saltarse el frontend.
 *
 * Cada caso declara qué se espera: `deny` (rechazo) o `allow`. Un
 * `deny` que responde 200 con datos es un hallazgo.
 */

const BASE = process.env.BASE ?? 'http://localhost:3000';
const CLAVE = 'Etapa8Auditoria!2026';
const CONDO_A = 'e5f326ea-b893-4de1-b68a-71f722525625';
const CONDO_B = 'df207403-5f2d-46ba-947d-f0665917e16e';
/** Condominio de OTRA empresa administradora. */
const CONDO_AJENO = '33ee83cc-3f39-43ec-a468-1c93f13c29e8';

const ROLES = {
  owner: 'owner@etapa8.test',
  supervisorA: 'supervisor-a@etapa8.test',
  contador: 'contador@etapa8.test',
  condomino: 'condomino@etapa8.test',
  guarda: 'guarda@etapa8.test',
  anonimo: null,
};

async function iniciarSesion(email) {
  const jar = new Map();
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  if (!email) return { cookie: () => '', email: '(anónimo)' };

  let r = await fetch(`${BASE}/api/auth/csrf`);
  absorb(r);
  const { csrfToken } = await r.json();
  r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password: CLAVE, callbackUrl: `${BASE}/app/dashboard` }),
  });
  absorb(r);
  const ok = [...jar.keys()].some((k) => k.includes('session-token'));
  if (!ok) throw new Error(`No se pudo iniciar sesión como ${email}`);
  return { cookie, email };
}

let fallos = 0;
let pasadas = 0;
const hallazgos = [];

/**
 * Un acceso se considera CONCEDIDO si responde 2xx y el cuerpo trae
 * datos. Una redirección al login o al panel es un rechazo: la
 * pantalla no se llegó a servir.
 */
async function intentar({ sesion, metodo = 'GET', ruta, espera, nota, detectaFuga }) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    redirect: 'manual',
    headers: { cookie: sesion.cookie() },
  });
  const status = res.status;
  const tipo = res.headers.get('content-type') ?? '';
  let cuerpo = '';
  let fuga = false;
  if (status >= 200 && status < 300) {
    if (tipo.includes('json') || tipo.includes('text') || tipo.includes('html')) {
      cuerpo = (await res.text()).slice(0, 200_000);
    } else {
      cuerpo = `<binario ${(await res.arrayBuffer()).byteLength} bytes>`;
    }
    fuga = detectaFuga ? detectaFuga(cuerpo) : true;
  }

  const concedido = status >= 200 && status < 300 && fuga;
  const ok = espera === 'allow' ? concedido : !concedido;
  const etiqueta = `[${sesion.email}] ${metodo} ${ruta}`;
  if (ok) {
    pasadas++;
    console.log(`  ✅ ${espera === 'deny' ? 'rechazado' : 'permitido'} (${status}) — ${nota}`);
  } else {
    fallos++;
    console.log(`  ❌ ${espera === 'deny' ? 'DEBIÓ RECHAZAR' : 'debió permitir'} (${status}) — ${nota}\n       ${etiqueta}`);
    if (espera === 'deny') hallazgos.push({ etiqueta, nota, status, muestra: cuerpo.slice(0, 300) });
  }
}

/** El Excel/PDF vacío no es una fuga: lo que importa es si trae filas. */
const traeDatos = (c) => !c.includes('Sin datos para este reporte') && c.length > 0;
/** Una página del panel servida de verdad (no un redirect ni el login). */
const esPanel = (c) => c.includes('<html') && !c.includes('Bienvenido de nuevo');

async function main() {
  console.log('🔓 ATAQUE ETAPA 8 — permisos, multi-condominio y API directa\n');
  const s = {};
  for (const [k, email] of Object.entries(ROLES)) s[k] = await iniciarSesion(email);

  console.log('\n━━━ 1. API directa: /api/finanzas/properties ━━━');
  console.log('   (saldos, nombre del propietario y estado de suspensión de cada filial)');
  await intentar({ sesion: s.owner, ruta: `/api/finanzas/properties?condoId=${CONDO_A}`, espera: 'allow',
    nota: 'el administrador sí puede consultar su condominio', detectaFuga: (c) => c.startsWith('[') });
  await intentar({ sesion: s.supervisorA, ruta: `/api/finanzas/properties?condoId=${CONDO_B}`, espera: 'deny',
    nota: 'supervisor de A pidiendo las filiales de B', detectaFuga: (c) => c.startsWith('[') && c.length > 2 });
  await intentar({ sesion: s.condomino, ruta: `/api/finanzas/properties?condoId=${CONDO_A}`, espera: 'deny',
    nota: 'un condómino pidiendo los saldos de todo el condominio', detectaFuga: (c) => c.startsWith('[') && c.length > 2 });
  await intentar({ sesion: s.guarda, ruta: `/api/finanzas/properties?condoId=${CONDO_A}`, espera: 'deny',
    nota: 'el oficial de caseta pidiendo la morosidad', detectaFuga: (c) => c.startsWith('[') && c.length > 2 });
  await intentar({ sesion: s.anonimo, ruta: `/api/finanzas/properties?condoId=${CONDO_A}`, espera: 'deny',
    nota: 'sin sesión' });

  console.log('\n━━━ 2. Descargas financieras con el condominio de otro ━━━');
  await intentar({ sesion: s.supervisorA, ruta: `/app/finanzas/exportar?tab=panel&condoId=${CONDO_B}`, espera: 'deny',
    nota: 'Excel de Finanzas de un condominio no asignado' });
  await intentar({ sesion: s.supervisorA, ruta: `/app/finanzas/exportar-estado?condoId=${CONDO_B}&estado=morosidad`, espera: 'deny',
    nota: 'Excel de morosidad de un condominio no asignado' });
  await intentar({ sesion: s.supervisorA, ruta: `/app/reportes/exportar?tab=egresos&condoId=${CONDO_B}&anio=2026`, espera: 'deny',
    nota: 'Excel de Egresos de un condominio no asignado', detectaFuga: (c) => c.includes('Avance obra B') });
  await intentar({ sesion: s.owner, ruta: `/app/finanzas/exportar?tab=panel&condoId=${CONDO_AJENO}`, espera: 'deny',
    nota: 'administrador pidiendo un condominio de OTRA empresa' });
  await intentar({ sesion: s.condomino, ruta: `/app/finanzas/exportar?tab=panel&condoId=${CONDO_A}`, espera: 'deny',
    nota: 'condómino descargando el Excel de Finanzas' });
  await intentar({ sesion: s.guarda, ruta: `/app/reportes/exportar?tab=morosidad`, espera: 'deny',
    nota: 'oficial de caseta descargando el reporte de morosidad' });
  await intentar({ sesion: s.contador, ruta: `/app/reportes/exportar?tab=morosidad`, espera: 'allow',
    nota: 'el contador sí ve reportes financieros' });

  console.log('\n━━━ 3. Estados financieros y caja chica (PDF) ━━━');
  await intentar({ sesion: s.supervisorA, ruta: `/app/contabilidad/eeff?condoId=${CONDO_B}&anio=2026&mes=6`, espera: 'deny',
    nota: 'EEFF de un condominio no asignado' });
  await intentar({ sesion: s.condomino, ruta: `/app/contabilidad/eeff?condoId=${CONDO_A}&anio=2026&mes=6`, espera: 'deny',
    nota: 'condómino descargando los estados financieros' });
  await intentar({ sesion: s.supervisorA, ruta: `/app/mantenimiento/informe-caja-chica?condoId=${CONDO_B}`, espera: 'deny',
    nota: 'informe de caja chica de un condominio no asignado' });

  console.log('\n━━━ 4. Pantallas del panel con rol equivocado ━━━');
  for (const [rol, ses] of [['condómino', s.condomino], ['oficial de caseta', s.guarda]]) {
    await intentar({ sesion: ses, ruta: '/app/finanzas/gastos', espera: 'deny', nota: `${rol} abriendo Finanzas → Gastos`, detectaFuga: esPanel });
    await intentar({ sesion: ses, ruta: '/app/auditoria', espera: 'deny', nota: `${rol} abriendo Auditoría`, detectaFuga: esPanel });
    await intentar({ sesion: ses, ruta: '/app/configuracion', espera: 'deny', nota: `${rol} abriendo Configuración`, detectaFuga: esPanel });
  }
  await intentar({ sesion: s.contador, ruta: '/app/propiedades', espera: 'deny',
    nota: 'contador abriendo Residentes (datos personales)', detectaFuga: esPanel });
  await intentar({ sesion: s.contador, ruta: '/app/seguridad', espera: 'deny',
    nota: 'contador abriendo Seguridad', detectaFuga: esPanel });
  await intentar({ sesion: s.supervisorA, ruta: '/app/configuracion', espera: 'deny',
    nota: 'supervisor abriendo Configuración (solo del titular)', detectaFuga: esPanel });

  console.log('\n━━━ 5. Panel de plataforma (master) ━━━');
  for (const [rol, ses] of [['administrador', s.owner], ['supervisor', s.supervisorA], ['condómino', s.condomino]]) {
    await intentar({ sesion: ses, ruta: '/master', espera: 'deny', nota: `${rol} entrando al panel master`, detectaFuga: esPanel });
  }

  console.log('\n━━━ 6. Portal del residente y caseta con rol equivocado ━━━');
  await intentar({ sesion: s.guarda, ruta: '/portal/estado-cuenta', espera: 'deny',
    nota: 'oficial de caseta abriendo el estado de cuenta del portal', detectaFuga: esPanel });
  await intentar({ sesion: s.condomino, ruta: '/seguridad/visitas', espera: 'deny',
    nota: 'condómino abriendo el portal de la caseta', detectaFuga: esPanel });

  console.log('\n━━━ 7. Tareas automáticas ━━━');
  await intentar({ sesion: s.anonimo, ruta: '/api/cron?job=facturacion', espera: 'deny', nota: 'cron sin secreto ni sesión' });
  await intentar({ sesion: s.condomino, ruta: '/api/cron?job=facturacion', espera: 'deny', nota: 'cron disparado por un condómino' });
  await intentar({ sesion: s.supervisorA, ruta: '/api/cron?job=facturacion', espera: 'deny', nota: 'cron disparado por un supervisor' });

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${pasadas} intentos con el resultado esperado, ${fallos} sin él.`);
  if (hallazgos.length) {
    console.log('\n━━━ HALLAZGOS ━━━');
    for (const h of hallazgos) console.log(`\n· ${h.nota}\n  ${h.etiqueta} → ${h.status}\n  ${h.muestra.replace(/\n/g, ' ').slice(0, 260)}`);
  }
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
