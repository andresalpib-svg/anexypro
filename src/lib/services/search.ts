import { withTenantContext } from '@/lib/db';

export type SearchResult = { type: string; label: string; sublabel: string; href: string };

/**
 * Búsqueda multi-entidad real — condominios, propiedades, documentos,
 * tickets, asambleas, proyectos.
 *
 * `condominiumIds` acota el alcance a los condominios que la sesión
 * tiene a su cargo, y es obligatorio: sin él, un supervisor asignado a
 * un solo condominio encontraría por aquí los documentos, las asambleas
 * y los proyectos de todos los demás de la empresa.
 */
export async function globalSearch(
  companyId: string,
  query: string,
  condominiumIds: string[]
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  if (condominiumIds.length === 0) return [];

  const enCondos = { condominiumId: { in: condominiumIds } };

  return withTenantContext(companyId, async (tx) => {
    const [condos, properties, documents, tickets, assemblies, projects] = await Promise.all([
      tx.condominium.findMany({
        where: { id: { in: condominiumIds }, name: { contains: q, mode: 'insensitive' }, deletedAt: null },
        take: 5,
      }),
      tx.property.findMany({ where: { ...enCondos, code: { contains: q, mode: 'insensitive' } }, include: { condominium: true }, take: 5 }),
      tx.document.findMany({ where: { ...enCondos, title: { contains: q, mode: 'insensitive' } }, include: { condominium: true }, take: 5 }),
      tx.maintenanceTicket.findMany({ where: { ...enCondos, title: { contains: q, mode: 'insensitive' } }, include: { condominium: true }, take: 5 }),
      tx.assembly.findMany({ where: { ...enCondos, title: { contains: q, mode: 'insensitive' } }, include: { condominium: true }, take: 5 }),
      tx.project.findMany({ where: { ...enCondos, name: { contains: q, mode: 'insensitive' } }, include: { condominium: true }, take: 5 }),
    ]);

    const results: SearchResult[] = [];
    for (const c of condos) results.push({ type: 'Condominio', label: c.name, sublabel: c.code, href: `/app/condominios/${c.id}` });
    for (const p of properties) results.push({ type: 'Propiedad', label: p.code, sublabel: p.condominium.name, href: `/app/propiedades/${p.id}` });
    for (const d of documents) results.push({ type: 'Documento', label: d.title, sublabel: d.condominium.name, href: `/app/documentos?condoId=${d.condominiumId}` });
    for (const t of tickets) results.push({ type: 'Mantenimiento', label: t.title, sublabel: t.condominium.name, href: `/app/mantenimiento?condoId=${t.condominiumId}` });
    for (const a of assemblies) results.push({ type: 'Asamblea', label: a.title, sublabel: a.condominium.name, href: `/app/asambleas/${a.id}` });
    for (const pr of projects) results.push({ type: 'Proyecto', label: pr.name, sublabel: pr.condominium.name, href: `/app/proyectos/${pr.id}` });

    return results;
  });
}
