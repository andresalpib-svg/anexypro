import { guessMime } from './local-provider';

/**
 * Encabezados de entrega seguros para un archivo del repositorio.
 *
 * POR QUÉ NO SE USA EL `mimeType` GUARDADO: ese valor venía del
 * `file.type` que declara el navegador al subir, y es falsificable —
 * un "factura.pdf" declarado como `text/html` se serviría como página
 * dentro del origen de la aplicación (XSS almacenado con la sesión de
 * quien lo abra). El tipo se deriva SIEMPRE de la extensión del nombre
 * guardado, contra la misma lista blanca del proveedor local; una
 * extensión desconocida cae a `application/octet-stream`.
 *
 * `inline` solo para los tipos que la aplicación muestra embebidos
 * (imágenes y PDF). Todo lo demás baja como `attachment`, que el
 * navegador nunca ejecuta en el origen.
 */
const INLINE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export function safeContentHeaders(name: string, opts?: { forceDownload?: boolean }) {
  const mime = guessMime(name);
  const disposition = !opts?.forceDownload && INLINE_MIMES.has(mime) ? 'inline' : 'attachment';
  return {
    mime,
    disposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
  };
}
