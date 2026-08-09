import { auth } from '@/lib/auth';
import { prisma, withTenantContext } from '@/lib/db';
import {
  actorFromSession,
  uploadToFolder,
  folderBySlug,
  ensureCompanyFolder,
  ensureResidentFolder,
} from '@/lib/services/storage';
import { guessMime } from '@/lib/storage/local-provider';
import { MEDIA_EXT, MEDIA_MAX_BYTES } from '@/lib/upload';
import { decodeUploadName } from '@/lib/nombre-subida';
import { refFromObjectId } from '@/lib/rutas-archivo';

/**
 * Reemplazo de `saveUpload` para todas las subidas del sistema.
 *
 * POR QUÉ EXISTE: `saveUpload` escribía en `public/uploads/`, así que
 * todo lo que subía el sistema —comprobantes de pago, facturas, fotos
 * de visitantes, documentos de residentes— quedaba accesible con solo
 * conocer la URL, sin sesión y sin verificar permisos. Este helper
 * guarda lo mismo en el repositorio privado.
 *
 * QUÉ DEVUELVE Y POR QUÉ: la ruta `/api/archivo/<id>`, no una URL del
 * proveedor. Eso permitió migrar los 21 puntos de subida sin tocar los
 * 33 campos del esquema ni los componentes que ya renderizaban
 * `<a href>` o `<img src>` con el valor guardado.
 *
 * No es una "URL permanente" en el sentido problemático: por sí sola no
 * da acceso a nada. Es un identificador interno, y la ruta a la que
 * apunta exige sesión y vuelve a verificar los permisos de la carpeta
 * en cada petición.
 */

// Las funciones que solo miran la FORMA de la referencia viven en
// `lib/rutas-archivo.ts` (sin sesión ni Prisma, para poder usarlas
// también desde componentes de cliente). Se reexportan para no
// cambiar los puntos que ya las importaban desde aquí.
export { REF_PREFIX, isRepositoryRef, isLegacyPublicRef, refFromObjectId, objectIdFromRef } from '@/lib/rutas-archivo';
export { decodeUploadName } from '@/lib/nombre-subida';

/** Destino de la subida: una carpeta del condominio o una de la empresa. */
export type Destination =
  | { kind: 'condo'; condominiumId: string; slug: string }
  | { kind: 'company'; slug: string; name: string }
  | { kind: 'resident'; condominiumId: string; personId: string };

export type SaveOptions = {
  maxBytes?: number;
  allowedExt?: Set<string>;
  /** Persona dueña del documento, si aplica. */
  ownerPersonId?: string | null;
};

/**
 * Guarda el archivo en el repositorio privado y devuelve la referencia
 * lista para escribir en la columna que antes guardaba `/uploads/...`.
 *
 * Requiere sesión: es la sesión la que determina si el usuario puede
 * escribir en esa carpeta.
 */
export async function saveToRepository(
  file: File,
  destination: Destination,
  opts: SaveOptions = {}
): Promise<string> {
  const session = await auth();
  if (!session?.user) throw new Error('Sesión requerida para subir archivos.');

  const maxBytes = opts.maxBytes ?? MEDIA_MAX_BYTES;
  const allowed = opts.allowedExt ?? MEDIA_EXT;

  if (file.size === 0) throw new Error('El archivo está vacío.');
  if (file.size > maxBytes) {
    throw new Error(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const fileName = decodeUploadName(file.name);
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!allowed.has(ext)) {
    throw new Error(`Tipo de archivo no permitido (.${ext}). Usá: ${[...allowed].join(', ')}.`);
  }

  const companyId = session.user.companyId;
  let folderId: string;

  if (destination.kind === 'condo') {
    folderId = (await folderBySlug(companyId, destination.condominiumId, destination.slug)).id;
  } else if (destination.kind === 'resident') {
    folderId = (await ensureResidentFolder(companyId, destination.condominiumId, destination.personId)).id;
  } else {
    folderId = (await ensureCompanyFolder(companyId, destination.slug, destination.name)).id;
  }

  const actor = await actorFromSession(session);
  const stored = await uploadToFolder(actor, {
    folderId,
    fileName,
    // Nunca el `file.type` del cliente (falsificable): siempre por extensión.
    mimeType: guessMime(fileName),
    data: Buffer.from(await file.arrayBuffer()),
    ownerPersonId: opts.ownerPersonId ?? null,
    userId: session.user.id,
    userName: session.user.name ?? 'Usuario',
  });

  return refFromObjectId(stored.id);
}

/**
 * El condominio activo del usuario, para las subidas que no lo reciben
 * explícitamente. Si no hay ninguno, se guarda en la empresa.
 */
export async function resolveCondoForUpload(
  companyId: string,
  explicit?: string | null
): Promise<string | null> {
  if (explicit) return explicit;
  const first = await withTenantContext(companyId, (tx) =>
    tx.condominium.findFirst({
      where: { companyId, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
  );
  return first?.id ?? null;
}
