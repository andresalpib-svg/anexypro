import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listRequestsByCondo, getTemplate, getAccountSnapshot } from '@/lib/services/document-requests';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { CondoSelect } from '../propiedades/condo-select';
import { RequestQueue, type QueueRow } from './request-queue';
import { TemplateEditor, type TemplateData } from './template-editor';

export default async function EmisionDocumentosPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'documentos')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Emisión de Documentos</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;

  const [requests, certTemplate, statementTemplate] = await Promise.all([
    listRequestsByCondo(session!.user.companyId, condoId),
    getTemplate(session!.user.companyId, condoId, 'certificacion_cuotas_al_dia'),
    getTemplate(session!.user.companyId, condoId, 'estado_cuenta'),
  ]);

  // Situación financiera actual de cada filial solicitante — la
  // administración ve si puede emitir ANTES de aprobar.
  const uniqueProps = [...new Set(requests.filter((r) => r.status === 'solicitada').map((r) => r.propertyId))];
  const snapshots = new Map(
    await Promise.all(
      uniqueProps.map(async (pid) => [pid, await getAccountSnapshot(session!.user.companyId, pid)] as const)
    )
  );

  const currency = condos.find((c) => c.id === condoId)?.currency ?? 'CRC';
  const rows: QueueRow[] = requests.map((r) => {
    const snap = snapshots.get(r.propertyId);
    return {
      id: r.id,
      docType: r.docType,
      status: r.status,
      propertyCode: r.property.code,
      personName: r.person.fullName,
      requestedAt: r.requestedAt.toISOString(),
      dueBy: r.dueBy.toISOString(),
      bodyText: r.bodyText,
      rejectReason: r.rejectReason,
      decidedByName: r.decidedByName,
      isCurrent: snap?.isCurrent ?? null,
      overdueCount: snap?.overdueCount ?? null,
      overdueAmount: snap?.overdueAmount ?? null,
    };
  });

  const asTemplate = (t: Awaited<ReturnType<typeof getTemplate>>): TemplateData => ({
    docType: t.docType,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor,
    headerText: t.headerText,
    footerText: t.footerText,
    adminName: t.adminName,
    adminDetails: t.adminDetails,
    bodyTemplate: t.bodyTemplate,
    signerName: t.signerName,
    signerTitle: t.signerTitle,
    signatureUrl: t.signatureUrl,
    requiresCurrentAccount: t.requiresCurrentAccount,
  });

  return (
    <div>
      <PageHeader
        title="Emisión de Documentos"
        menu={<ModuleActions module="/app/emision-documentos" />}
        subtitle="Solicitudes de los condóminos — certificación de cuotas al día y estado de cuenta"
      />
      <CondoSelect condos={condos} selected={condoId} />

      <RequestQueue rows={rows} currency={currency} />

      <p className="mb-2 mt-8 text-xs font-bold uppercase tracking-wide text-muted">Configuración de los documentos</p>
      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div id="plantillas-documentos" className="scroll-mt-24 space-y-3 transition-all">
        <TemplateEditor condominiumId={condoId} template={asTemplate(certTemplate)} />
        <TemplateEditor condominiumId={condoId} template={asTemplate(statementTemplate)} />
        </div>
      </div>
    </div>
  );
}
