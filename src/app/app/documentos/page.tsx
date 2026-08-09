import { FileText, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listDocuments } from '@/lib/services/documents';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { NewDocumentForm, NewVersionForm, BodyTextForm } from './forms';
import { archiveDocumentAction } from './actions';

const CATEGORY_LABEL: Record<string, string> = {
  reglamento: 'Reglamento',
  contrato: 'Contrato',
  manual: 'Manual',
  seguro: 'Seguro',
  garantia: 'Garantía',
  plano: 'Plano',
  otro: 'Otro',
};

function expiryStatus(expiresOn: Date | null): { label: string; variant: 'ok' | 'warn' | 'danger' } | null {
  if (!expiresOn) return null;
  const days = (new Date(expiresOn).getTime() - Date.now()) / 86400000;
  if (days < 0) return { label: 'Vencido', variant: 'danger' };
  if (days <= 30) return { label: 'Por vencer', variant: 'warn' };
  return { label: 'Vigente', variant: 'ok' };
}

export default async function DocumentosPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'documentos')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Documentos</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const documents = condoId ? await listDocuments(session!.user.companyId, condoId) : [];

  return (
    <div>
      <PageHeader title="Gestión Documental" subtitle="Reglamentos, contratos, actas, manuales, seguros — con versionado real" />

      {condos.length === 0 ? (
        <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />
      ) : (
        <>
          <CondoSelect condos={condos} selected={condoId!} />
          <div className="mt-5">
            <NewDocumentForm condominiumId={condoId!} />
          </div>

          <div className="mt-5 space-y-3">
            {documents.length === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-14 text-center">
                <FileText className="text-muted" size={26} />
                <p className="text-sm text-muted">Sin documentos todavía.</p>
              </div>
            ) : (
              documents.map((d) => {
                const expiry = expiryStatus(d.expiresOn);
                return (
                  <div key={d.id} className="card p-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{d.title}</p>
                      <StatusChip variant="royal">{CATEGORY_LABEL[d.category]}</StatusChip>
                      {d.visibility === 'residentes' && <StatusChip variant="ok">Visible a residentes</StatusChip>}
                      {expiry && <StatusChip variant={expiry.variant}>{expiry.label}</StatusChip>}
                      {d.status === 'archivado' && <StatusChip variant="neutral">Archivado</StatusChip>}
                      {d.status === 'vigente' && (
                        <form action={archiveDocumentAction.bind(null, d.id)} className="ml-auto">
                          <button className="text-xs text-muted hover:text-danger">Archivar</button>
                        </form>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Versión actual: v{d.currentVersion} · {d.versions[0]?.fileName}
                    </p>
                    <NewVersionForm documentId={d.id} />
                    {d.category === 'reglamento' && <BodyTextForm documentId={d.id} currentText={d.bodyText} />}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
