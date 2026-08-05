import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { actorFromSession, readObject } from '@/lib/services/storage';

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

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': String(file.data.length),
        // `inline`: la mayoría de estas referencias son imágenes y PDF
        // que se muestran dentro de la aplicación.
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
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
