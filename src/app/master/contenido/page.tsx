import { forEachCompany, withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { videoThumbnail } from '@/lib/video';
import { ContentAdmin, type MasterCondo, type MasterContentItem } from './content-admin';

/**
 * Contenido de Valor es curaduría de plataforma: solo el master lo
 * administra, para cualquier condominio de cualquier empresa. Los
 * paneles de administración y supervisión lo ven en modo lectura.
 */
export default async function MasterContentPage({ searchParams }: { searchParams: { condoId?: string } }) {
  // El master ve los condominios de todas las empresas, pero los lee
  // empresa por empresa: con RLS forzado no hay consulta que mire por
  // encima del aislamiento.
  const condos = (
    await forEachCompany((tx) =>
      tx.condominium.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, companyId: true, company: { select: { legalName: true, tradeName: true } } },
        orderBy: { name: 'asc' },
      })
    )
  )
    .flatMap((x) => x.result)
    .sort((a, b) =>
      (a.company.legalName + a.name).localeCompare(b.company.legalName + b.name, 'es')
    );

  if (condos.length === 0) {
    return (
      <div>
        <PageHeader title="Contenido de Valor" subtitle="Curaduría de la plataforma" />
        <div className="card p-10 text-center text-sm text-muted">Todavía no hay condominios registrados.</div>
      </div>
    );
  }

  const selected = condos.find((c) => c.id === searchParams.condoId) ?? condos[0]!;
  const items = await withTenantContext(selected.companyId, (tx) =>
    tx.contentItem.findMany({
      where: { condominiumId: selected.id },
      orderBy: { createdAt: 'desc' },
    })
  );

  return (
    <div>
      <PageHeader
        title="Contenido de Valor"
        subtitle="Videos, manuales y consejos — solo el master los crea, publica y elimina"
      />
      <ContentAdmin
        condos={condos.map((c): MasterCondo => ({ id: c.id, name: c.name, companyName: c.company.tradeName ?? c.company.legalName }))}
        selectedId={selected.id}
        items={items.map(
          (i): MasterContentItem => ({
            id: i.id,
            title: i.title,
            category: i.category,
            thumbnail: i.videoUrl ? videoThumbnail(i.videoUrl) : null,
            published: Boolean(i.publishedAt),
          })
        )}
      />
    </div>
  );
}
