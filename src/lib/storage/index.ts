import { prisma } from '@/lib/db';
import type { StorageKind, StorageProvider } from './provider';
import { LocalStorageProvider } from './local-provider';
import { GoogleDriveProvider, type GoogleDriveConfig } from './google-drive-provider';

/**
 * Fábrica del repositorio.
 *
 * Es el ÚNICO lugar del sistema que sabe qué proveedores existen.
 * Agregar Amazon S3 mañana son tres líneas acá y un archivo nuevo que
 * implemente `StorageProvider`. Ningún módulo cambia.
 */

export const PROVIDER_LABEL: Record<StorageKind, string> = {
  local: 'Servidor de ANEXYpro',
  google_drive: 'Google Drive',
  s3: 'Amazon S3',
  gcs: 'Google Cloud Storage',
  r2: 'Cloudflare R2',
  azure_blob: 'Azure Blob Storage',
};

/** Proveedores que ya tienen implementación. El resto está declarado para la migración. */
export const IMPLEMENTED: StorageKind[] = ['local', 'google_drive'];

export type StorageConfigRow = {
  provider: StorageKind;
  rootFolderId: string | null;
  config: unknown;
};

/** Configuración global. Se crea en la primera lectura si no existe. */
export async function getStorageSettings(): Promise<StorageConfigRow> {
  const row = await prisma.storageSettings.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  });
  return { provider: row.provider as StorageKind, rootFolderId: row.rootFolderId, config: row.config };
}

export async function setStorageSettings(input: {
  provider: StorageKind;
  config?: unknown;
  rootFolderId?: string | null;
  userId?: string;
}) {
  return prisma.storageSettings.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      provider: input.provider,
      config: (input.config ?? undefined) as any,
      rootFolderId: input.rootFolderId ?? null,
      updatedById: input.userId ?? null,
    },
    update: {
      provider: input.provider,
      ...(input.config !== undefined ? { config: input.config as any } : {}),
      ...(input.rootFolderId !== undefined ? { rootFolderId: input.rootFolderId } : {}),
      updatedById: input.userId ?? null,
    },
  });
}

/**
 * Construye el proveedor activo.
 *
 * Las credenciales de Google Drive se leen primero del entorno y, si no
 * están, de la configuración guardada. El entorno gana para que en
 * producción se puedan rotar sin tocar la base.
 */
export function buildProvider(kind: StorageKind, config?: unknown): StorageProvider {
  switch (kind) {
    case 'local':
      return new LocalStorageProvider();

    case 'google_drive': {
      const stored = (config ?? {}) as Partial<GoogleDriveConfig>;
      const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL ?? stored.clientEmail;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? stored.privateKey;
      const driveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID ?? stored.driveId;
      const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID ?? stored.oauthClientId;
      const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET ?? stored.oauthClientSecret;
      const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN ?? stored.oauthRefreshToken;

      // OAuth de usuario tiene prioridad: es la única vía que Google
      // permite para SUBIR a un Drive personal gratuito (las cuentas de
      // servicio ya no tienen cuota). La cuenta de servicio queda para
      // unidades compartidas de Workspace.
      if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
        return new GoogleDriveProvider({ oauthClientId, oauthClientSecret, oauthRefreshToken, driveId });
      }
      if (!clientEmail || !privateKey) {
        throw new Error(
          'Google Drive está seleccionado pero faltan credenciales: o las tres GOOGLE_DRIVE_OAUTH_* (Drive personal) o GOOGLE_DRIVE_CLIENT_EMAIL y GOOGLE_DRIVE_PRIVATE_KEY (unidad compartida de Workspace).'
        );
      }
      return new GoogleDriveProvider({ clientEmail, privateKey, driveId });
    }

    // Declarados para la migración. Cuando se necesiten, se crea el
    // archivo del proveedor y se reemplaza este error por su
    // constructor — sin tocar nada más del sistema.
    case 's3':
    case 'gcs':
    case 'r2':
    case 'azure_blob':
      throw new Error(
        `${PROVIDER_LABEL[kind]} todavía no tiene proveedor implementado. La arquitectura ya lo contempla: falta el archivo que implemente StorageProvider.`
      );

    default:
      throw new Error(`Proveedor de almacenamiento desconocido: ${kind}`);
  }
}

/** El proveedor activo según la configuración global. */
export async function activeProvider(): Promise<StorageProvider> {
  const settings = await getStorageSettings();
  return buildProvider(settings.provider, settings.config);
}

/**
 * Proveedor real a usar para UNA empresa concreta.
 *
 * PASO 8 — ya NO fuerza `local` para las empresas demo (como hacía
 * desde el Paso 1). Se revirtió a propósito: en producción el disco de
 * una función serverless es EFÍMERO —no sobrevive entre invocaciones
 * ni se comparte entre ellas—, así que "local" nunca funcionó de
 * verdad ahí; solo lo parecía en desarrollo, donde `storage/` es una
 * carpeta real y persistente en la máquina. Toda empresa —demo o
 * real— usa ahora el MISMO proveedor activo de la plataforma. Lo que
 * aísla a una demo ya no es el proveedor: es tener su propio árbol de
 * carpetas ("DEMOS/DEMO_<companyId>", ver `services/storage.ts` →
 * `ensureCondoTree`), separado del árbol "Condominios" de los
 * clientes reales, identificado por `companyId` en la base — nunca
 * por el nombre de la carpeta.
 *
 * Esta función se conserva (en vez de llamar `activeProvider()`
 * directo en cada sitio) porque sigue siendo el único punto donde,
 * mañana, podría volver a hacer falta una excepción por empresa —por
 * ejemplo, un cliente grande con su propia cuenta de Drive dedicada.
 */
export async function providerForCompany(companyId: string): Promise<{
  kind: StorageKind;
  provider: StorageProvider;
  config: unknown;
}> {
  const settings = await getStorageSettings();
  return {
    kind: settings.provider,
    provider: buildProvider(settings.provider, settings.config),
    config: settings.config,
  };
}

export type { StorageProvider, StorageKind } from './provider';
