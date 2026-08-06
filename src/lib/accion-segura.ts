'use client';

import { toast } from 'sonner';

/**
 * Ejecuta una Server Action desde el navegador SIN que un fallo tumbe
 * la pantalla.
 *
 * POR QUÉ EXISTE. El patrón corriente en esta aplicación es:
 *
 *     startTransition(async () => {
 *       const r = await miAccion(id);
 *       if (r.ok) toast.success(...);
 *     });
 *
 * Si `miAccion` RECHAZA —la red se cayó, el servidor devolvió 500, la
 * sesión venció a mitad de camino—, React entrega esa excepción a la
 * frontera de error más cercana y sustituye la pantalla entera por
 * "Algo salió mal" con un código de nueve cifras. Está comprobado en
 * vivo: con `fetch` roto, dar de baja a un residente borraba la
 * pantalla de Propiedades. Para quien administra es desconcertante —
 * perdió la tabla completa y el código no le dice nada.
 *
 * Que la acción devuelva `{ok:false}` NO alcanza: el rechazo ocurre en
 * el cliente, antes de que el servidor llegue a responder nada. La
 * captura tiene que estar aquí, en el sitio de la llamada.
 *
 * Devuelve `null` cuando la llamada no llegó a completarse, para que
 * quien la usa distinga "falló el viaje" de "el servidor dijo que no".
 */
export async function ejecutar<T>(
  llamada: () => Promise<T>,
  mensaje = MENSAJE_POR_OMISION
): Promise<T | null> {
  try {
    return await llamada();
  } catch (e) {
    // A la consola del inspector, para poder diagnosticarlo; a la
    // pantalla, un aviso que no destruye el contexto de trabajo.
    console.error('[acción]', e);
    toast.error(mensaje);
    return null;
  }
}

const MENSAJE_POR_OMISION =
  'No se pudo completar la operación. Revisá la conexión e intentá de nuevo.';

/**
 * Envoltura de `startTransition` que no deja escapar un rechazo.
 *
 * Es la misma protección que `ejecutar`, pero aplicada al bloque
 * entero en vez de a una llamada suelta. Se usa así:
 *
 *     enTransicion(startTransition, async () => {
 *       const r = await miAccion(id);
 *       if (r.ok) toast.success('Listo.'); else toast.error(r.error);
 *     });
 *
 * Se eligió esta forma —y no envolver cada acción por separado— porque
 * conserva el cuerpo tal cual estaba: el cambio en cada pantalla es una
 * línea, no una reescritura, y no hay que ir comprobando `null` en
 * decenas de sitios. Lo que importa es que NADA de lo que pase ahí
 * dentro llegue a la frontera de error.
 */
export function enTransicion(
  transicion: (fn: () => void) => void,
  cuerpo: () => Promise<void> | void,
  mensaje = MENSAJE_POR_OMISION
): void {
  // El `async` va DENTRO de la transición, no fuera: si se lanzara la
  // promesa por su cuenta, React daría la transición por terminada al
  // instante y los botones dejarían de mostrarse deshabilitados
  // mientras se guarda.
  transicion(async () => {
    try {
      await cuerpo();
    } catch (e) {
      console.error('[acción]', e);
      toast.error(mensaje);
    }
  });
}
