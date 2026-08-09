/**
 * Cómo se ve una referencia a un archivo guardado, sin depender de la
 * sesión ni de Prisma — así también la pueden usar los componentes de
 * cliente (`services/file-refs.ts` arrastra `auth` y la base de datos y
 * no se puede importar desde el navegador).
 */

export const REF_PREFIX = '/api/archivo/';

/** ¿Este valor guardado apunta al repositorio privado? */
export function isRepositoryRef(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(REF_PREFIX));
}

/**
 * ¿Es una subida antigua, de cuando los archivos vivían en
 * `public/uploads/`? Esa carpeta ya no existe, así que estos valores
 * son enlaces muertos: la interfaz debe mostrarlos como no disponibles
 * en vez de ofrecer un enlace que da 404.
 */
export function isLegacyPublicRef(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith('/uploads/'));
}

export function refFromObjectId(objectId: string): string {
  return `${REF_PREFIX}${objectId}`;
}

export function objectIdFromRef(ref: string): string | null {
  return isRepositoryRef(ref) ? ref.slice(REF_PREFIX.length) : null;
}
