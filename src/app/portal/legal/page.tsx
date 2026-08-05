import { Scale } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getPropertySuspension } from '@/lib/services/finance';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { LegalQuestionForm } from './legal-question-form';

export default async function LegalAssistantPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const suspension = await getPropertySuspension(session!.user.companyId, ctx.property.id);
  const regulations = await withTenantContext(session!.user.companyId, (tx) =>
    tx.document.findMany(  {
      where: { condominiumId: ctx.condominium.id, category: 'reglamento', visibility: 'residentes', status: 'vigente' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    })
  );

  if (suspension.suspended) {
    return (
      <div>
        <PageHeader title="Árbitro Legal IA" subtitle="Consulta sobre reglamento y normativa" />
        <div className="card p-8 text-center">
          <p className="text-sm font-semibold text-danger">Bloqueado por suspensión de servicios</p>
          <p className="mt-1 text-sm text-muted">Ponte al día con tu cuota condominal para volver a usar este asistente.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Árbitro Legal IA" subtitle="Consulta sobre reglamento, ley y normativa" />

      <div className="card mb-4 flex items-start gap-3 p-4 text-sm">
        <Scale size={16} className="mt-0.5 flex-none text-lumen" />
        <p className="text-muted">
          Responde exclusivamente con base en el texto real del reglamento que tu administración cargó
          — nunca inventa artículos. Si tu pregunta no está cubierta, te lo va a decir en vez de
          improvisar.
        </p>
      </div>

      <LegalQuestionForm />

      <div className="card mt-4 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Reglamentos vigentes</p>
        {regulations.length === 0 ? (
          <p className="text-sm text-muted">Tu administración todavía no ha publicado un reglamento visible para residentes.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {regulations.map((r) => (
              <li key={r.id}>
                <a href={r.versions[0]?.fileUrl} target="_blank" rel="noreferrer" className="font-medium text-royal hover:underline">
                  {r.title}
                </a>
                <span className="ml-1 text-muted">(v{r.currentVersion})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
