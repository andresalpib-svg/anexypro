import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { toggleableModules, getHiddenModules } from '@/lib/services/module-visibility';
import { ModuleToggles, type CompanyOption } from './module-toggles';

/** Solo el master decide qué módulos ve el panel de cada empresa. */
export default async function MasterModulesPage({ searchParams }: { searchParams: { companyId?: string } }) {
  const companies = await prisma.company.findMany({
    select: { id: true, legalName: true, tradeName: true },
    orderBy: { legalName: 'asc' },
  });

  if (companies.length === 0) {
    return (
      <div>
        <PageHeader title="Módulos del panel" subtitle="Qué ve cada empresa administradora" />
        <div className="card p-10 text-center text-sm text-muted">Todavía no hay empresas registradas.</div>
      </div>
    );
  }

  const selected = companies.find((c) => c.id === searchParams.companyId) ?? companies[0]!;
  const hidden = await getHiddenModules(selected.id);

  return (
    <div>
      <PageHeader
        title="Módulos del panel"
        subtitle="Activa o desactiva los módulos que ve cada empresa administradora"
      />
      <ModuleToggles
        companies={companies.map((c): CompanyOption => ({ id: c.id, name: c.tradeName ?? c.legalName }))}
        selectedId={selected.id}
        modules={toggleableModules()}
        hidden={hidden}
      />
    </div>
  );
}
