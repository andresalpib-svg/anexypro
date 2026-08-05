import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Mail, MailWarning, Eye, EyeOff, Gavel, Paperclip } from 'lucide-react';
import { auth } from '@/lib/auth';
import { requirePanel } from '@/lib/guard';
import { getCase } from '@/lib/services/violations';
import { money } from '@/lib/pdf/violation-notice';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CloseCaseButton } from './close-case-button';

export const dynamic = 'force-dynamic';

/**
 * Expediente digital: todo lo del caso en un solo lugar — cada
 * notificación emitida, sus fotografías, quién la emitió, si el correo
 * salió y cuándo la leyó el residente.
 */
export default async function ExpedientePage({ params }: { params: { id: string } }) {
  const session = await requirePanel({ module: '/app/incumplimientos' });
  if (!session) notFound();

  const expediente = await getCase(session.user.companyId, params.id);
  if (!expediente) notFound();

  const currency = expediente.condominium.currency;

  return (
    <div>
      <Link href="/app/incumplimientos" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal">
        <ArrowLeft size={15} /> Volver a Incumplimientos
      </Link>

      <PageHeader
        title={`Expediente ${expediente.caseNumber}`}
        subtitle={`${expediente.property.code} · ${expediente.violationType.name}`}
        action={
          expediente.status === 'abierto' ? <CloseCaseButton caseId={expediente.id} /> : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- Ficha ---------- */}
        <div className="card p-5 lg:col-span-1">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Datos del caso</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Fila k="Estado">
              <StatusChip variant={expediente.status === 'abierto' ? 'warn' : 'ok'}>
                {expediente.status === 'abierto' ? 'Abierto' : 'Cerrado'}
              </StatusChip>
            </Fila>
            <Fila k="Propietario">{expediente.person?.fullName ?? '—'}</Fila>
            <Fila k="Correo">{expediente.person?.email ?? 'sin correo registrado'}</Fila>
            <Fila k="Condominio">{expediente.condominium.name}</Fila>
            <Fila k="Reglamento">{expediente.violationType.regulationArticle ?? '—'}</Fila>
            <Fila k="Advertencias">
              {expediente.warningsIssued} de {expediente.violationType.warningsRequired}
            </Fila>
            <Fila k="Multa">{expediente.fineIssued ? 'Aplicada' : 'No aplicada'}</Fila>
            <Fila k="Abierto">{new Date(expediente.openedAt).toLocaleDateString('es-CR')}</Fila>
            {expediente.nextActionDueAt && (
              <Fila k="Siguiente acción">
                a partir del {new Date(expediente.nextActionDueAt).toLocaleDateString('es-CR')}
              </Fila>
            )}
            {expediente.closedAt && (
              <Fila k="Cerrado">
                {new Date(expediente.closedAt).toLocaleDateString('es-CR')}
                {expediente.closeReason ? ` — ${expediente.closeReason}` : ''}
              </Fila>
            )}
            <Fila k="Registrado por">{expediente.createdByName ?? '—'}</Fila>
          </dl>
        </div>

        {/* ---------- Historial ---------- */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            Notificaciones emitidas ({expediente.actions.length})
          </h2>

          <ol className="space-y-3">
            {expediente.actions.map((a) => (
              <li key={a.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-bold text-ink">
                      {a.kind === 'multa' ? (
                        <>
                          <Gavel size={16} className="text-danger" /> Resolución de multa
                        </>
                      ) : (
                        <>
                          <FileText size={16} className="text-royal" /> Notificación {a.sequence}.ª
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {new Date(a.issuedAt).toLocaleString('es-CR')} · emitida por {a.issuedByName ?? '—'}
                      {a.supervisorName ? ` (supervisor)` : ''}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1 text-xs">
                    <EstadoCorreo estado={a.emailStatus} destino={a.emailTo} />
                    {a.readAt ? (
                      <span className="flex items-center gap-1 text-ok">
                        <Eye size={13} /> Leída el {new Date(a.readAt).toLocaleString('es-CR')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted">
                        <EyeOff size={13} /> Sin confirmar lectura
                      </span>
                    )}
                  </div>
                </div>

                {a.fineAmount != null && (
                  <p className="mt-3 inline-block rounded-lg bg-danger-bg px-3 py-1.5 text-sm font-bold text-danger">
                    {money(Number(a.fineAmount), currency)}
                    {a.charge ? ` · cobro ${a.charge.status}` : ' · sin cobro generado'}
                  </p>
                )}

                {a.observation && (
                  <p className="mt-3 rounded-lg bg-canvas p-3 text-sm text-ink">{a.observation}</p>
                )}

                {a.evidences.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <Paperclip size={12} /> Evidencia ({a.evidences.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {a.evidences.map((e) =>
                        e.kind === 'imagen' ? (
                          <a key={e.id} href={e.fileRef} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={e.fileRef}
                              alt={e.fileName}
                              className="h-24 w-24 rounded-lg border border-line object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            key={e.id}
                            href={e.fileRef}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-24 w-24 items-center justify-center rounded-lg border border-line bg-canvas text-xs text-muted"
                          >
                            {e.fileName.split('.').pop()?.toUpperCase()}
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}

                {a.documentRef && (
                  <a
                    href={a.documentRef}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal"
                  >
                    <FileText size={14} /> Descargar el documento en PDF
                  </a>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Fila({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function EstadoCorreo({ estado, destino }: { estado: string; destino: string | null }) {
  if (estado === 'enviado') {
    return (
      <span className="flex items-center gap-1 text-ok" title={destino ?? ''}>
        <Mail size={13} /> Correo enviado
      </span>
    );
  }
  const texto =
    estado === 'sin_destinatario'
      ? 'Sin correo del propietario'
      : estado === 'error'
        ? 'El correo falló'
        : 'Correo no configurado';
  return (
    <span className={`flex items-center gap-1 ${estado === 'error' ? 'text-danger' : 'text-warn'}`}>
      <MailWarning size={13} /> {texto}
    </span>
  );
}
