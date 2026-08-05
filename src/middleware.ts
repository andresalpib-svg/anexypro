import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

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
  if (pathname.startsWith('/master') && role !== 'master') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/app') && !['admin_owner', 'admin_staff', 'contador'].includes(role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/seguridad') && role !== 'seguridad') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/portal') && role !== 'condomino') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return withPath();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
