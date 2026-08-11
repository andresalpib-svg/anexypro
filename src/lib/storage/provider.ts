/**
 * Contrato del repositorio de documentos.
 *
 * ESTA ES LA ÚNICA PUERTA. Ningún módulo de ANEXYpro conoce —ni debe
 * conocer— si detrás hay Google Drive, S3, Cloudflare R2 o el disco
 * local. Los módulos hablan con `services/storage.ts`, que a su vez
 * habla con esta interfaz.
 *
 * Consecuencia práctica: migrar de proveedor es implementar esta
 * interfaz una vez más y cambiar la configuración. No se toca una sola
 * línea del resto del sistema.
 *
 * Los identificadores que devuelven los proveedores (`id`) son OPACOS:
 * el resto del sistema los guarda y los devuelve, pero nunca los
 * interpreta ni los construye. Por eso funcionan igual siendo un id de
 * Drive, una llave de S3 o una ruta local.
 */

export type StorageKind = 'local' | 'google_drive' | 's3' | 'gcs' | 'r2' | 'azure_blob';

export type FolderRef = {
  /** Identificador opaco asignado por el proveedor. */
  id: string;
  name: string;
};

export type FileRef = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** Fecha que reporta el proveedor, si la reporta. */
  modifiedAt?: Date | null;
};

export type UploadInput = {
  name: string;
  mimeType: string;
  parentId: string;
  data: Buffer;
};

export type SearchInput = {
  /** Texto a buscar en el nombre del archivo. */
  query: string;
  /** Limitar a una carpeta. Sin esto, busca en todo el repositorio. */
  parentId?: string;
  limit?: number;
};

/** Hijos DIRECTOS de una carpeta, separados por tipo. */
export type FolderChildren = {
  folders: FolderRef[];
  files: FileRef[];
};

/**
 * Procedencia real de un recurso (archivo o carpeta) en el proveedor —
 * la usa un borrado FÍSICO e irreversible (PASO 9, limpieza de una
 * cuenta DEMO) para comprobar, en el proveedor y no solo en la base de
 * datos propia, que el recurso vive ÚNICAMENTE donde se espera antes de
 * borrarlo para siempre.
 */
export type OwnershipInfo = {
  /** `false` si el proveedor ya no tiene ese id (borrado, o nunca existió). */
  exists: boolean;
  /** Padres reales que reporta el proveedor. Un proveedor que solo
   *  admite un padre (el local) siempre devuelve exactamente uno. */
  parents: string[];
  /** El proveedor lo marca como compartido con alguien más. Un
   *  proveedor sin noción de "compartir" (el local) siempre `false`. */
  shared: boolean;
};

export interface StorageProvider {
  readonly kind: StorageKind;

  /**
   * Crea la carpeta si no existe y devuelve su referencia. Es
   * IDEMPOTENTE a propósito: el árbol de un condominio se puede
   * reconstruir sin duplicar carpetas.
   */
  createFolder(name: string, parentId?: string): Promise<FolderRef>;

  uploadFile(input: UploadInput): Promise<FileRef>;

  /** Devuelve los bytes. Nunca una URL: la ubicación real no sale de acá. */
  downloadFile(id: string): Promise<Buffer>;

  deleteFile(id: string): Promise<void>;

  /**
   * Hijos DIRECTOS de una carpeta — carpetas Y archivos, separados. A
   * diferencia de `listFolder` (que a propósito excluye carpetas: está
   * pensada para mostrarle contenido a un usuario), esta la usa un
   * recorrido que necesita encontrar TODO lo que hay debajo de una
   * carpeta antes de borrarla (PASO 9).
   */
  listChildren(parentId: string): Promise<FolderChildren>;

  /**
   * Comprueba la procedencia real de un recurso antes de un borrado
   * FÍSICO. Ver `OwnershipInfo`.
   */
  inspectOwnership(id: string): Promise<OwnershipInfo>;

  /**
   * Borrado DEFINITIVO de un archivo, SIN pasar por la papelera.
   * Distinto de `deleteFile` a propósito: ese va a la papelera porque
   * un borrado accidental de un documento normal (un acta, un
   * contrato) debe poder recuperarse. Este es para cuando el borrado
   * TIENE que ser irreversible y queda auditado aparte — hoy solo la
   * limpieza de una cuenta DEMO (PASO 9, `services/demo-cleanup.ts`).
   * IDEMPOTENTE: si el id ya no existe, no es un error.
   */
  deleteFilePermanently(id: string): Promise<void>;

  /**
   * Borrado DEFINITIVO de una carpeta. Se llama SOLO cuando quien
   * orquesta el borrado (`services/demo-cleanup.ts`) ya comprobó —con
   * `listChildren`— que está vacía; nunca debe depender de un borrado
   * en cascada del proveedor, porque eso borraría sin verificar cada
   * hijo por separado. IDEMPOTENTE: si el id ya no existe, no es un
   * error.
   */
  deleteFolderPermanently(id: string): Promise<void>;

  moveFile(id: string, toParentId: string): Promise<void>;

  copyFile(id: string, toParentId: string, newName?: string): Promise<FileRef>;

  getMetadata(id: string): Promise<FileRef | null>;

  listFolder(parentId: string): Promise<FileRef[]>;

  searchFiles(input: SearchInput): Promise<FileRef[]>;

  renameFile(id: string, newName: string): Promise<void>;

  /**
   * Verificación de que el proveedor está bien configurado y
   * responde. La usa la pantalla de configuración del master para no
   * dejar activo un proveedor que no funciona.
   */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}

/**
 * Nota sobre "generar enlace temporal".
 *
 * NO es un método del proveedor a propósito. Si cada proveedor emitiera
 * su propio enlace firmado, la URL revelaría dónde vive el archivo
 * (el bucket, el id de Drive) y el requisito es justamente que el
 * usuario nunca conozca la ubicación real.
 *
 * En su lugar, ANEXYpro emite un enlace propio de corta vida hacia su
 * propia ruta, verifica permisos al usarse y recién entonces pide los
 * bytes al proveedor. Ver `services/storage-links.ts`.
 */
