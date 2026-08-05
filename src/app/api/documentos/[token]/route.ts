import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { safeContentHeaders } from '@/lib/storage/serve-headers';
import { verifyLink } from '@/lib/services/storage-links';
import { actorFromSession, readObject } from '@/lib/services/storage';

export const dynamic = 'force-dynamic';

/**
 * Entrega de un documento.
 *
 * Es la ÚNICA salida de bytes del repositorio. Verifica tres cosas, en
 * este orden:
 *  1. El enlace es auténtico y no venció.
 *  2. Hay sesión y es el mismo usuario al que se le emitió.
 *  3. Ese usuario TODAVÍA tiene permiso sobre la carpeta.
 *
 * El punto 3 es el importante: los permisos se vuelven a verificar en
 * el momento de la descarga, no solo cuando se generó el enlace. Si al
 * usuario le revocaron el acceso hace un minuto, el enlace deja de
 * funcionar aunque no haya vencido.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const check = verifyLink(params.token);
  if (!check.ok) return new NextResponse(check.reason, { status: 403 });

  const session = await auth();
  if (!session?.user) return new NextResponse('Sesión requerida.', { status: 401 });

  // El enlace no es transferible: solo sirve a quien se le emitió.
  if (session.user.id !== check.payload.u) {
    return new NextResponse('Este enlace fue emitido para otro usuario.', { status: 403 });
  }

  try {
    const actor = await actorFromSession(session);
    const file = await readObject(actor, check.payload.o);

    // Tipo y disposición derivados de la extensión del nombre guardado,
    // nunca del `mimeType` que declaró el cliente al subir (falsificable).
    const safe = safeContentHeaders(file.name, { forceDownload: check.payload.m === 'd' });

    // Uint8Array en vez de Buffer: es lo que acepta el cuerpo de la
    // respuesta en el entorno de Next.
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': safe.mime,
        'Content-Length': String(file.data.length),
        'Content-Disposition': safe.disposition,
        // Nunca en caché compartida: es contenido privado.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? 'No se pudo entregar el documento.', { status: 403 });
  }
}
