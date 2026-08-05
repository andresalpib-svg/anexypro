import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listVisibleProviders } from '@/lib/services/service-providers';
import { PageHeader } from '@/components/ui/page-header';
import { ProviderDirectory, type DirectoryProvider } from './provider-directory';

export default async function ResidentProvidersPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const providers = await listVisibleProviders();

  return (
    <div>
      <PageHeader
        title="Directorio de proveedores varios"
        subtitle="Materiales, accesorios y mantenimiento — para que arranques tu proyecto sin dar vueltas"
      />
      <ProviderDirectory
        providers={providers.map(
          (p): DirectoryProvider => ({
            id: p.id,
            category: p.category,
            name: p.name,
            description: p.description,
            accessories: p.accessories,
            phone: p.phone,
            whatsapp: p.whatsapp,
            email: p.email,
            website: p.website,
            logoUrl: p.logoUrl,
          })
        )}
      />
    </div>
  );
}
