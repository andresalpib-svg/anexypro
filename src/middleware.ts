import NextAuth from 'next-auth';
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth.config';

// NO importar `@/lib/auth` aquí: arrastra Prisma, que no funciona en
// Edge Runtime y hacía que TODA petición devolviera 500 en producción.
// El middleware solo necesita leer el token, y para eso basta la
// configuración compartida.
const { auth } = NextAuth(authConfig);

/**
 * Rutas que se ven sin sesión. Las de recuperación tienen que estar
 * aquí por definición: quien no puede entrar es justamente quien las
 * necesita.
 */
function esPublica(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/recuperar' ||
    pathname === '/restablecer' ||
    pathname.startsWith('/restablecer/') ||
    pathname.startsWith('/api/auth') ||
    // /demo crea su propia empresa aislada y no necesita sesión — es la
    // puerta pública para probar ANEXYpro sin una cuenta real.
    pathname === '/demo'
  );
}

/**
 * Rutas que NO se autorizan con la sesión del navegador y por eso no
 * pueden pasar por el portero de este middleware.
 *
 * Hoy es una sola: `/api/cron`. La llama el programador del hosting con
 * `Authorization: Bearer <CRON_SECRET>`, sin cookie de sesión — y el
 * middleware, que solo sabe de sesiones, la mandaba a /login con un 307.
 * El resultado era el peor posible: Vercel disparaba el cron todos los
 * días, recibía un redirect perfectamente válido y lo daba por bueno,
 * mientras el manejador de la ruta NUNCA llegaba a ejecutarse. Ningún
 * proceso automático corría —intereses moratorios, facturación de la
 * cuota, gastos recurrentes, avisos de contratos, cobranza, informe
 * mensual, revisión del sistema— y no había error en ningún lado que lo
 * delatara: la bitácora de corridas quedaba vacía, que es exactamente lo
 * que se ve cuando el cron todavía no se ha programado.
 *
 * Dejarla pasar NO la abre: `/api/cron` hace su propia autorización
 * (secreto en tiempo constante, o sesión master/admin_owner) y responde
 * 401 por su cuenta. Un 401 es además lo correcto para una API —el
 * redirect a /login nunca lo fue.
 */
function seAutorizaSola(pathname: string): boolean {
  return pathname === '/api/cron';
}

/**
 * CSP con nonce por petición (auditoría de seguridad 2026-08-11,
 * hallazgo #18 — opción B del informe, elegida sobre C).
 *
 * `script-src` con nonce + `strict-dynamic` cierra el vector de XSS
 * que de verdad importa: un script inyectado por un atacante no lleva
 * el nonce de esta petición, así que el navegador nunca lo ejecuta —
 * tenga o no una URL propia. No hay ningún script de terceros en el
 * proyecto (sin Analytics, sin Sentry, nada — comprobado antes de
 * escribir esto) y tampoco ningún `dangerouslySetInnerHTML` con
 * `<script>` a mano, así que no hay nada que se pueda romper por este
 * lado. `style-src` se deja con `'unsafe-inline'` A PROPÓSITO: la
 * interfaz usa `style={{...}}` en ~18 archivos (colores de marca del
 * condominio, barras de progreso) y bloquearlo exige revisar cada uno
 * a mano — se deja para una pasada aparte, ver el informe.
 *
 * Se genera ACÁ, no en `next.config.js`: el nonce tiene que cambiar en
 * cada petición — un valor fijo en la config no protegería nada.
 */
function construirCsp(nonce: string): string {
  // En DESARROLLO —y solo ahí— la política se afloja en dos puntos, o
  // la aplicación no arranca en la máquina de quien programa:
  //
  //  · `'unsafe-eval'`: el recargado en caliente de Next evalúa código
  //    como texto. Sin esto la hidratación muere con "Evaluating a
  //    string as JavaScript violates..." y la pantalla se queda en el
  //    logo para siempre — no se puede probar nada localmente.
  //  · `upgrade-insecure-requests`: manda todo a https, y el servidor
  //    de desarrollo habla http en localhost.
  //
  // `next dev` no se ejecuta en producción, así que el despliegue
  // conserva la política estricta intacta.
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    dev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * Headers de la PETICIÓN (no de la respuesta) con el nonce y el CSP ya
 * puestos. Next.js lee el `Content-Security-Policy` de la petición
 * entrante para aplicar el nonce automáticamente a sus propios scripts
 * de arranque (hidratación, runtime de webpack) — es el mecanismo
 * documentado de Next, no un header cualquiera: sin esto, esos
 * scripts —que no son nuestros, los genera el framework— quedarían
 * bloqueados por la propia política y la aplicación no arrancaría.
 */
function headersConNonce(req: NextRequest, nonce: string, csp: string): Headers {
  const h = new Headers(req.headers);
  h.set('x-nonce', nonce);
  h.set('Content-Security-Policy', csp);
  return h;
}

// Tres portales, igual que el prototipo: /app (Administradora),
// /seguridad (Portal de Seguridad), /portal (Ecosistema Condómino).
// El middleware solo verifica sesión + que el rol coincida con el
// portal solicitado — el detalle de permisos por módulo (can(), RBAC)
// se resuelve dentro de cada layout/página, no aquí.
const conSesion = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = construirCsp(nonce);
  const requestHeaders = headersConNonce(req, nonce, csp);

  // Toda respuesta que sigue a la petición (nunca los redirect, que no
  // renderizan nada en este ciclo) lleva el CSP con el nonce de esta
  // petición, tanto en la petición reenviada (para que Next se aplique
  // el nonce a sí mismo) como en la respuesta (para que el navegador
  // la haga cumplir).
  const siguiente = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };
  const redirigir = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  // La ruta se propaga como header de request para que los layouts
  // (server components) puedan aplicar reglas por módulo — headers()
  // no expone el pathname por sí solo.
  const withPath = () => {
    requestHeaders.set('x-pathname', pathname);
    return siguiente();
  };

  if (esPublica(pathname) || seAutorizaSola(pathname)) return siguiente();

  if (!session?.user) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return redirigir(url);
  }

  const role = session.user.role;
  // Coincidencia por segmento, no por prefijo de texto: `startsWith`
  // a secas también casaría con una futura ruta `/aplicaciones`.
  const en = (base: string) => pathname === base || pathname.startsWith(`${base}/`);

  if (en('/master') && role !== 'master') {
    return redirigir(new URL('/', req.url));
  }
  if (en('/app') && !['admin_owner', 'admin_staff', 'contador'].includes(role)) {
    return redirigir(new URL('/', req.url));
  }
  if (en('/seguridad') && role !== 'seguridad') {
    return redirigir(new URL('/', req.url));
  }
  if (en('/portal') && role !== 'condomino') {
    return redirigir(new URL('/', req.url));
  }

  return withPath();
});

/**
 * El middleware no debe tumbar el sitio.
 *
 * Si la lectura de la sesión falla —por configuración del entorno, por
 * un token con formato inesperado o por cualquier fallo de la librería—
 * antes se propagaba la excepción y Vercel devolvía 500 en TODAS las
 * rutas, incluida la de acceso: la aplicación quedaba inservible y sin
 * forma de entrar a arreglarla.
 *
 * Ahora se registra el fallo con el contexto necesario para
 * diagnosticarlo (nunca el valor de una variable, solo si está
 * presente) y se cierra el paso mandando al acceso, que es el lado
 * seguro: ante la duda, sin sesión.
 */
/**
 * Fuerza HTTPS antes de cualquier otra cosa.
 *
 * Vercel ya redirige HTTP → HTTPS en su borde para cualquier dominio
 * que sirve, y el `Strict-Transport-Security` de `next.config.js` hace
 * que el navegador ni siquiera intente HTTP después de la primera
 * visita. Esto es la tercera capa, a propósito redundante: si el día
 * de mañana ANEXYpro queda detrás de otro proxy (o de un balanceador
 * que no fuerce TLS por su cuenta), la aplicación igual rechaza servir
 * nada por HTTP en vez de confiar en que la capa de enfrente lo hizo.
 *
 * `x-forwarded-proto` es el header estándar que un proxy TLS-terminating
 * (Vercel incluido) agrega con el protocolo ORIGINAL de la petición.
 * Sin proxy adelante (una prueba local con `next start`) el header no
 * existe, y ahí no hay nada que forzar: por eso solo actúa cuando el
 * header está presente y dice explícitamente "http".
 */
function forzarHttps(req: NextRequest): NextResponse | null {
  const proto = req.headers.get('x-forwarded-proto');
  if (proto !== 'http') return null;
  const host = req.headers.get('host') ?? '';
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) return null;

  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = host;
  // 308: conserva el método y el cuerpo (una petición POST por HTTP no
  // se convierte en GET al redirigir) y no se cachea de forma tan
  // agresiva como para complicar revertirlo si algún día hiciera falta.
  return NextResponse.redirect(url, 308);
}

export default async function middleware(req: NextRequest, ctx: any) {
  const redirigidoAHttps = forzarHttps(req);
  if (redirigidoAHttps) return redirigidoAHttps;

  try {
    return await (conSesion as any)(req, ctx);
  } catch (e: any) {
    const { pathname } = req.nextUrl;
    console.error('[middleware] fallo al resolver la sesión', {
      mensaje: e?.message,
      ruta: pathname,
      host: req.headers.get('host'),
      // Presencia, no valor: basta para distinguir un problema de
      // configuración de uno de datos.
      tieneAuthSecret: Boolean(process.env.AUTH_SECRET),
      tieneAuthUrl: Boolean(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL),
    });

    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const csp = construirCsp(nonce);

    // También acá: si la lectura de la sesión falla, `/api/cron` tiene
    // que seguir llegando a su manejador — no depende de la sesión para
    // autorizarse, y mandarlo a /login volvería a detener en silencio
    // todos los procesos automáticos.
    if (esPublica(pathname) || seAutorizaSola(pathname)) {
      const res = NextResponse.next({ request: { headers: headersConNonce(req, nonce, csp) } });
      res.headers.set('Content-Security-Policy', csp);
      return res;
    }
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(url);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
