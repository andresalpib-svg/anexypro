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

// Tres portales, igual que el prototipo: /app (Administradora),
// /seguridad (Portal de Seguridad), /portal (Ecosistema Condómino).
// El middleware solo verifica sesión + que el rol coincida con el
// portal solicitado — el detalle de permisos por módulo (can(), RBAC)
// se resuelve dentro de cada layout/página, no aquí.
const conSesion = auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // La ruta se propaga como header de request para que los layouts
  // (server components) puedan aplicar reglas por módulo — headers()
  // no expone el pathname por sí solo.
  const withPath = () => {
    const h = new Headers(req.headers);
    h.set('x-pathname', pathname);
    return NextResponse.next({ request: { headers: h } });
  };

  if (esPublica(pathname)) return NextResponse.next();

  if (!session?.user) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const role = session.user.role;
  // Coincidencia por segmento, no por prefijo de texto: `startsWith`
  // a secas también casaría con una futura ruta `/aplicaciones`.
  const en = (base: string) => pathname === base || pathname.startsWith(`${base}/`);

  if (en('/master') && role !== 'master') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (en('/app') && !['admin_owner', 'admin_staff', 'contador'].includes(role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (en('/seguridad') && role !== 'seguridad') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (en('/portal') && role !== 'condomino') {
    return NextResponse.redirect(new URL('/', req.url));
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
export default async function middleware(req: NextRequest, ctx: any) {
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

    if (esPublica(pathname)) return NextResponse.next();
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
