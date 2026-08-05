import { PageHeader } from '@/components/ui/page-header';
import { getStorageSettings, PROVIDER_LABEL, IMPLEMENTED } from '@/lib/storage';
import { storageStats } from '@/lib/services/storage';
import type { StorageKind } from '@/lib/storage/provider';
import { StorageConfig, type ProviderOption } from './storage-config';

const ORDER: StorageKind[] = ['google_drive', 'local', 's3', 'gcs', 'r2', 'azure_blob'];

export default async function MasterStoragePage() {
  const [settings, stats] = await Promise.all([getStorageSettings(), storageStats()]);

  return (
    <div>
      <PageHeader
        title="Repositorio de documentos"
        subtitle="Proveedor de almacenamiento de toda la plataforma"
      />
      <StorageConfig
        stats={stats}
        providers={ORDER.map(
          (kind): ProviderOption => ({
            kind,
            label: PROVIDER_LABEL[kind],
            implemented: IMPLEMENTED.includes(kind),
            active: settings.provider === kind,
          })
        )}
      />
    </div>
  );
}
