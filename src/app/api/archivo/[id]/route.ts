import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { actorFromSession, readObject } from '@/lib/services/storage';
import { safeContentHeaders } from '@/lib/storage/serve-headers';

export const dynamic = 'force-dynamic';

/**
 * Entrega de un archivo del repositorio por su identificador.
 *
 * Es la ruta a la que apuntan las referencias guardadas en la base
 * (`/api/archivo/<id>`), y funciona igual para un `<a href>` y para un
 * `<img src>` — que fue el motivo de elegir esta forma: permitió migrar
 * todas las subidas sin reescribir los componentes.
 *
 * A diferencia de `/api/documentos/[token]`, acá no hay token: la
 * autorización es la SESIÓN. Se verifica en cada petición, así que un
 * cambio de permisos surte efecto de inmediato y la referencia
 * guardada en la base no sirve de nada por sí sola.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Sesión requerida.', { status: 401 });

  try {
    const actor = await actorFromSession(session);
    const file = await readObject(actor, params.id);

    // Tipo y disposición derivados de la extensión, nunca del valor
    // guardado (que declaró el cliente al subir). Ver serve-headers.ts.
    const safe = safeContentHeaders(file.name);

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': safe.mime,
        'Content-Length': String(file.data.length),
        'Content-Disposition': safe.disposition,
        // Caché PRIVADA: la puede guardar el navegador del usuario, pero
        // nunca un intermediario compartido.
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? 'No se pudo entregar el archivo.', { status: 403 });
  }
}
