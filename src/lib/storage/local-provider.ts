import { mkdir, writeFile, readFile, unlink, rename, copyFile, stat, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FileRef, FolderChildren, FolderRef, OwnershipInfo, SearchInput, StorageProvider, UploadInput } from './provider';

/**
 * Proveedor local — el primero que funciona y el que permite probar
 * toda la arquitectura sin credenciales de nadie.
 *
 * Guarda en `storage/` en la raíz del proyecto, **fuera de `public/`**.
 * Eso es deliberado: lo que está en `public/` lo sirve el servidor web
 * a cualquiera que adivine la URL, y el requisito es que ningún
 * archivo sea público. Acá los bytes solo salen por la ruta de
 * descarga de ANEXYpro, después de verificar permisos.
 *
 * Sirve para desarrollo y para instalaciones de un solo servidor.
 * Cuando el volumen o el despliegue lo pidan, se cambia el proveedor
 * activo y nada más.
 */

const ROOT = path.join(process.cwd(), 'storage');

/** Nombre de carpeta seguro: sin separadores ni recorridos hacia arriba. */
function safeSegment(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'sin-nombre';
}

/**
 * El identificador de una carpeta es su ruta relativa; el de un
 * archivo, la ruta relativa completa. Se validan siempre antes de
 * tocar el disco para que un id manipulado no pueda salirse de ROOT.
 */
function resolveSafe(relative: string): string {
  const abs = path.resolve(ROOT, relative);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
    throw new Error('Ruta de almacenamiento inválida.');
  }
  return abs;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  xml: 'application/xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export function guessMime(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Carpeta contenedora de una ruta relativa. `''` para algo en la raíz. */
function parentOf(relative: string): string {
  const d = path.dirname(relative);
  return d === '.' ? '' : d;
}

export class LocalStorageProvider implements StorageProvider {
  readonly kind = 'local' as const;

  async createFolder(name: string, parentId?: string): Promise<FolderRef> {
    const segment = safeSegment(name);
    const relative = parentId ? path.join(parentId, segment) : segment;
    await mkdir(resolveSafe(relative), { recursive: true });
    return { id: relative, name };
  }

  async uploadFile(input: UploadInput): Promise<FileRef> {
    // Nombre en disco aleatorio: el nombre real vive en la base de
    // datos. Así dos archivos con el mismo nombre no se pisan y el
    // nombre original no queda expuesto en el sistema de archivos.
    const ext = (input.name.split('.').pop() ?? '').toLowerCase();
    const stored = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
    const relative = path.join(input.parentId, stored);
    const abs = resolveSafe(relative);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, input.data);
    return {
      id: relative,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      modifiedAt: new Date(),
    };
  }

  async downloadFile(id: string): Promise<Buffer> {
    return readFile(resolveSafe(id));
  }

  async deleteFile(id: string): Promise<void> {
    await unlink(resolveSafe(id)).catch(() => undefined);
  }

  /** Hijos directos de una carpeta, carpetas y archivos separados. */
  async listChildren(parentId: string): Promise<FolderChildren> {
    const abs = resolveSafe(parentId);
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    const folders: FolderRef[] = [];
    const files: FileRef[] = [];
    for (const e of entries) {
      const relative = path.join(parentId, e.name);
      if (e.isDirectory()) {
        folders.push({ id: relative, name: e.name });
      } else if (e.isFile()) {
        const info = await stat(resolveSafe(relative));
        files.push({ id: relative, name: e.name, mimeType: guessMime(e.name), sizeBytes: info.size, modifiedAt: info.mtime });
      }
    }
    return { folders, files };
  }

  /**
   * El proveedor local no tiene noción de "carpeta compartida" ni de
   * varios padres: el padre real es, siempre, el directorio que
   * contiene la ruta relativa — por eso `matchesExpectedParent` (que
   * calcula quien orquesta la limpieza) siempre da verdadero acá salvo
   * que el dato guardado en la base esté corrupto.
   */
  async inspectOwnership(id: string): Promise<OwnershipInfo> {
    try {
      await stat(resolveSafe(id));
    } catch {
      return { exists: false, parents: [], shared: false };
    }
    return { exists: true, parents: [parentOf(id)], shared: false };
  }

  async deleteFilePermanently(id: string): Promise<void> {
    try {
      await unlink(resolveSafe(id));
    } catch (e: any) {
      if (e?.code === 'ENOENT') return; // ya no existe: idempotente
      throw e;
    }
  }

  /**
   * `rmdir` simple, SIN recursividad: falla si la carpeta no está
   * vacía. Es a propósito — una red de seguridad extra, gratis, contra
   * un error de quien orquesta que la llame antes de haber vaciado
   * de verdad el contenido.
   */
  async deleteFolderPermanently(id: string): Promise<void> {
    try {
      await rmdir(resolveSafe(id));
    } catch (e: any) {
      if (e?.code === 'ENOENT') return; // ya no existe: idempotente
      throw e;
    }
  }

  async moveFile(id: string, toParentId: string): Promise<void> {
    const from = resolveSafe(id);
    const to = resolveSafe(path.join(toParentId, path.basename(id)));
    await mkdir(path.dirname(to), { recursive: true });
    await rename(from, to);
  }

  async copyFile(id: string, toParentId: string, newName?: string): Promise<FileRef> {
    const from = resolveSafe(id);
    const ext = (id.split('.').pop() ?? '').toLowerCase();
    const stored = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
    const relative = path.join(toParentId, stored);
    const to = resolveSafe(relative);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    const info = await stat(to);
    const name = newName ?? path.basename(id);
    return { id: relative, name, mimeType: guessMime(name), sizeBytes: info.size, modifiedAt: info.mtime };
  }

  async getMetadata(id: string): Promise<FileRef | null> {
    try {
      const info = await stat(resolveSafe(id));
      const name = path.basename(id);
      return { id, name, mimeType: guessMime(name), sizeBytes: info.size, modifiedAt: info.mtime };
    } catch {
      return null;
    }
  }

  async listFolder(parentId: string): Promise<FileRef[]> {
    const abs = resolveSafe(parentId);
    const entries = await readdir(abs, { withFileTypes: true }).catch(() => []);
    const out: FileRef[] = [];
    for (const e of entries) {
      if (!e.isFile()) continue;
      const relative = path.join(parentId, e.name);
      const info = await stat(resolveSafe(relative));
      out.push({
        id: relative,
        name: e.name,
        mimeType: guessMime(e.name),
        sizeBytes: info.size,
        modifiedAt: info.mtime,
      });
    }
    return out;
  }

  async searchFiles({ query, parentId, limit = 50 }: SearchInput): Promise<FileRef[]> {
    const base = parentId ?? '';
    const needle = query.toLowerCase();
    const found: FileRef[] = [];

    const walk = async (relative: string): Promise<void> => {
      if (found.length >= limit) return;
      const entries = await readdir(resolveSafe(relative), { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (found.length >= limit) return;
        const child = path.join(relative, e.name);
        if (e.isDirectory()) await walk(child);
        else if (e.name.toLowerCase().includes(needle)) {
          const info = await stat(resolveSafe(child));
          found.push({
            id: child,
            name: e.name,
            mimeType: guessMime(e.name),
            sizeBytes: info.size,
            modifiedAt: info.mtime,
          });
        }
      }
    };
    await walk(base);
    return found;
  }

  async renameFile(id: string, newName: string): Promise<void> {
    // El nombre visible vive en la base de datos, así que renombrar en
    // disco no es necesario. Se implementa para cumplir el contrato de
    // la interfaz sin dejar un hueco.
    const abs = resolveSafe(id);
    await stat(abs);
  }

  async healthCheck() {
    try {
      await mkdir(ROOT, { recursive: true });
      const probe = path.join(ROOT, '.health');
      await writeFile(probe, 'ok');
      await unlink(probe);
      return { ok: true, detail: `Almacenamiento local disponible en ${ROOT}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message ?? 'No se pudo escribir en el directorio de almacenamiento.' };
    }
  }
}
