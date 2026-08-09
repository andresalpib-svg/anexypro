import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requirePanel } from '@/lib/guard';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listViolationTypes, getViolationSettings } from '@/lib/services/violations';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { TypeCatalog } from './type-catalog';
import { DocumentSettings } from './document-settings';

export const dynamic = 'force-dynamic';

/**
 * Configuración del módulo. Todo lo que define el comportamiento
 * —qué incumplimientos existen, cuántas advertencias llevan, cada
 * cuántos días escalan, cuánto es la multa y qué dice el documento— se
 * edita aquí, sin tocar código.
 */
export default async function ConfiguracionPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await requirePanel({ module: '/app/incumplimientos', roles: ['admin_owner'] });
  if (!session) notFound();

  const condos = await listCondominiumsForSession(session);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;

  const [tipos, settings] = await Promise.all([
    listViolationTypes(session.user.companyId, condoId),
    getViolationSettings(session.user.companyId, condoId),
  ]);

  return (
    <div>
      <Link
        href={`/app/incumplimientos?condoId=${condoId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal"
      >
        <ArrowLeft size={15} /> Volver a Incumplimientos
      </Link>

      <PageHeader
        title="Configuración de Incumplimientos"
        subtitle="Catálogo, escalamiento y formato del documento"
        action={<CondoSelect condos={condos} selected={condoId} />}
      />

      <TypeCatalog
        condominiumId={condoId}
        tipos={tipos.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          regulationArticle: t.regulationArticle,
          warningsRequired: t.warningsRequired,
          daysBetween: t.daysBetween,
          fineAmount: Number(t.fineAmount),
          immediateFine: t.immediateFine,
          warningTemplate: t.warningTemplate,
          secondWarningTemplate: t.secondWarningTemplate,
          fineTemplate: t.fineTemplate,
          sortOrder: t.sortOrder,
          isActive: t.isActive,
        }))}
      />

      <DocumentSettings
        condominiumId={condoId}
        settings={
          settings
            ? {
                primaryColor: settings.primaryColor,
                headerText: settings.headerText,
                footerText: settings.footerText,
                adminName: settings.adminName,
                adminDetails: settings.adminDetails,
                signerName: settings.signerName,
                signerTitle: settings.signerTitle,
                responseDays: settings.responseDays,
                logoUrl: settings.logoUrl,
              }
            : null
        }
      />
    </div>
  );
}
