import { listAllProviders } from '@/lib/services/service-providers';
import { PageHeader } from '@/components/ui/page-header';
import { ProviderAdmin, type AdminProvider } from './provider-admin';

export default async function MasterProvidersPage() {
  const providers = await listAllProviders();

  return (
    <div>
      <PageHeader
        title="Directorio de proveedores varios"
        subtitle="Base de datos de la plataforma — la consultan los residentes de todos los condominios"
      />
      <ProviderAdmin
        providers={providers.map(
          (p): AdminProvider => ({
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
            visible: p.visible,
          })
        )}
      />
    </div>
  );
}
