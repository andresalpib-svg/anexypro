import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

// NO importar `@/lib/auth` aquí: arrastra Prisma, que no funciona en
// Edge Runtime y hacía que TODA petición devolviera 500 en producción.
// El middleware solo necesita leer el token, y para eso basta la
// configuración compartida.
const { auth } = NextAuth(authConfig);

// Tres portales, igual que el prototipo: /app (Administradora),
// /seguridad (Portal de Seguridad), /portal (Ecosistema Condómino).
// El middleware solo verifica sesión + que el rol coincida con el
// portal solicitado — el detalle de permisos por módulo (can(), RBAC)
// se resuelve dentro de cada layout/página, no aquí.
export default auth((req) => {
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

  const isPublic = pathname === '/login' || pathname.startsWith('/api/auth');
  if (isPublic) return NextResponse.next();

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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
