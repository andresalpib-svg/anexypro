/**
 * Recompone el nombre de un archivo subido por formulario.
 *
 * POR QUÉ HACE FALTA: el analizador de `multipart/form-data` entrega el
 * nombre decodificado como latin-1, así que "factura ñandú.png" llega
 * como "factura Ã±andÃº.png" y así se guardaba en el repositorio, en la
 * copia de Google Drive y en la bitácora de Auditoría. En Costa Rica
 * casi todo adjunto lleva tilde o ñ, de modo que pasaba casi siempre.
 *
 * Se reinterpretan los bytes como UTF-8 y el resultado se acepta SOLO
 * si es válido (`fatal: true`). Un nombre que de verdad venía en
 * latin-1 no forma UTF-8 válido, salta la excepción y se devuelve tal
 * cual: nunca se empeora un nombre que ya estaba bien.
 *
 * Vive aparte de `services/file-refs.ts` —que arrastra la sesión y
 * Prisma— para poder probarse como lo que es: una función pura.
 */
export function decodeUploadName(name: string): string {
  // Sin caracteres altos no hay nada que reinterpretar.
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'));
  } catch {
    return name;
  }
}
