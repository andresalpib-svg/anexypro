import { Gavel, FileText, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listResidentNotices } from '@/lib/services/violations';
import { money } from '@/lib/pdf/violation-notice';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { ConfirmRead } from './confirm-read';

export const dynamic = 'force-dynamic';

/**
 * Notificaciones de incumplimiento del residente.
 *
 * Puede leer el detalle, ver las fotografías, descargar el PDF y
 * confirmar la lectura. La confirmación se registra con fecha y hora, y
 * queda visible del lado de la administración en el expediente.
 */
export default async function PortalIncumplimientosPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const avisos = await listResidentNotices(session!.user.companyId, ctx.property.id);

  return (
    <div>
      <PageHeader
        title="Notificaciones de incumplimiento"
        subtitle={`Filial ${ctx.property.code} · ${ctx.condominium.name}`}
      />

      {avisos.length === 0 ? (
        <div className="card p-12 text-center">
          <Gavel className="mx-auto mb-3 text-muted" size={26} />
          <p className="text-sm text-muted">No tenés notificaciones de incumplimiento. </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {avisos.map((a) => {
            const esMulta = a.kind === 'multa';
            return (
              <li key={a.id} className={`card p-5 ${a.readAt ? '' : 'border-l-4 border-l-royal'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-base font-bold text-ink">
                      {esMulta ? <Gavel size={17} className="text-danger" /> : <AlertTriangle size={17} className="text-warn" />}
                      {esMulta ? 'Resolución de multa' : `Notificación ${a.sequence}.ª`} — {a.case.violationType.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Expediente {a.case.caseNumber} · emitida el {new Date(a.issuedAt).toLocaleString('es-CR')}
                    </p>
                    {a.case.violationType.regulationArticle && (
                      <p className="text-xs text-muted">Reglamento: {a.case.violationType.regulationArticle}</p>
                    )}
                  </div>
                  {a.readAt ? (
                    <StatusChip variant="ok">Leída</StatusChip>
                  ) : (
                    <StatusChip variant="warn">Sin leer</StatusChip>
                  )}
                </div>

                {a.fineAmount != null && (
                  <p className="mt-3 inline-block rounded-lg bg-danger-bg px-3 py-1.5 text-sm font-bold text-danger">
                    Multa: {money(Number(a.fineAmount), a.case.condominium.currency)}
                  </p>
                )}

                {a.bodyText && (
                  <div className="mt-3 whitespace-pre-line rounded-xl bg-canvas p-4 text-sm leading-relaxed text-ink">
                    {a.bodyText}
                  </div>
                )}

                {a.observation && (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-semibold">Observación:</span> {a.observation}
                  </p>
                )}

                {a.evidences.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-semibold text-muted">Evidencia ({a.evidences.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {a.evidences.map((e) =>
                        e.kind === 'imagen' ? (
                          <a key={e.id} href={e.fileRef} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              loading="lazy"
                              decoding="async"
                              src={e.fileRef}
                              alt={e.fileName}
                              className="h-28 w-28 rounded-lg border border-line object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            key={e.id}
                            href={e.fileRef}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-28 w-28 items-center justify-center rounded-lg border border-line bg-canvas text-xs text-muted"
                          >
                            Ver {e.fileName.split('.').pop()?.toUpperCase()}
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  {a.documentRef && (
                    <a
                      href={a.documentRef}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-sm font-semibold text-royal"
                    >
                      <FileText size={15} /> Descargar el documento
                    </a>
                  )}
                  {a.readAt ? (
                    <span className="text-xs text-muted">
                      Lectura confirmada el {new Date(a.readAt).toLocaleString('es-CR')}
                    </span>
                  ) : (
                    <ConfirmRead actionId={a.id} />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
