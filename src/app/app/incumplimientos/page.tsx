import Link from 'next/link';
import { Gavel, Eye } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listViolationTypes, listCases } from '@/lib/services/violations';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { QuickNotice } from './quick-notice';

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<string, string> = { abierto: 'Abierto', cerrado: 'Cerrado', anulado: 'Anulado' };
const ESTADO_VARIANT: Record<string, 'warn' | 'ok' | 'neutral'> = {
  abierto: 'warn',
  cerrado: 'ok',
  anulado: 'neutral',
};

export default async function IncumplimientosPage({
  searchParams,
}: {
  searchParams: { condoId?: string };
}) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);

  if (!condoId) {
    return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;
  }

  const condo = condos.find((c) => c.id === condoId)!;
  const [tipos, casos] = await Promise.all([
    listViolationTypes(session!.user.companyId, condoId, true),
    listCases(session!.user.companyId, condoId),
  ]);

  return (
    <div>
      <PageHeader
        title="Gestión de Incumplimientos"
        subtitle="Notificá un incumplimiento del reglamento en tres pasos"
        menu={<ModuleActions module="/app/incumplimientos" />}
        action={
          <CondoSelect condos={condos} selected={condoId} />
        }
      />

      <QuickNotice
        condominiumId={condoId}
        condominiumName={condo.name}
        tipos={tipos.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          regulationArticle: t.regulationArticle,
          immediateFine: t.immediateFine,
          warningsRequired: t.warningsRequired,
          fineAmount: String(t.fineAmount),
          icon: t.icon,
        }))}
      />

      {/* ---------------- Expedientes ---------------- */}
      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
          <Gavel size={16} className="text-royal" /> Expedientes ({casos.length})
        </h2>

        {casos.length === 0 ? (
          <div className="card p-10 text-center text-sm text-muted">
            Todavía no hay expedientes en este condominio.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Expediente</th>
                  <th className="px-4 py-3">Filial</th>
                  <th className="px-4 py-3">Incumplimiento</th>
                  <th className="px-4 py-3">Etapa</th>
                  <th className="px-4 py-3">Última acción</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => {
                  const ultima = c.actions[0];
                  const leidas = c.actions.filter((a) => a.readAt).length;
                  return (
                    <tr key={c.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-semibold text-ink">{c.caseNumber}</td>
                      <td className="px-4 py-3">
                        <span className="block text-ink">{c.property.code}</span>
                        <span className="text-xs text-muted">{c.person?.fullName ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-ink">{c.violationType.name}</td>
                      <td className="px-4 py-3 text-muted">
                        {c.fineIssued
                          ? 'Multa aplicada'
                          : `${c.warningsIssued} advertencia${c.warningsIssued === 1 ? '' : 's'}`}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {ultima ? new Date(ultima.issuedAt).toLocaleDateString('es-CR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip variant={ESTADO_VARIANT[c.status] ?? 'neutral'}>
                          {ESTADO_LABEL[c.status] ?? c.status}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className="inline-flex items-center gap-1 text-xs text-muted"
                          title={`${leidas} de ${c.actions.length} notificaciones leídas por el residente`}
                        >
                          <Eye size={13} /> {leidas}/{c.actions.length}
                        </span>
                        <Link
                          href={`/app/incumplimientos/${c.id}`}
                          className="ml-3 text-xs font-semibold text-royal"
                        >
                          Ver expediente
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
