import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { requirePanel, allowsCondo } from '@/lib/guard';
import { condoOfProperty } from '@/lib/services/entity-scope';
import { getStatementHeader, listStatementMovements } from '@/lib/services/account-statements';
import { getAccountSnapshot, listRequestsByProperty } from '@/lib/services/document-requests';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { ChargePaymentCell } from '../charge-payment-cell';
import { SendStatementForm } from '../send-statement-form';

const TYPE_LABEL: Record<string, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  local: 'Local',
  lote: 'Lote',
  parqueo: 'Parqueo',
  bodega: 'Bodega',
};

// Mismas etiquetas que `portal/estado-cuenta/request-docs.tsx` — es la
// misma tabla, solo que aquí de solo lectura (administración gestiona
// la solicitud desde Emisión de Documentos, no desde acá).
const DOC_LABEL: Record<string, string> = {
  certificacion_cuotas_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};
const STATUS_LABEL: Record<string, string> = { solicitada: 'En trámite', aprobada: 'Emitido', rechazada: 'Rechazada' };
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger'> = { solicitada: 'warn', aprobada: 'ok', rechazada: 'danger' };
const fechaCorta = (d: Date) => d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Estado de cuenta administrativo de UNA filial.
 *
 * Guarda en dos pasos, igual que `documento/[id]/page.tsx`:
 *  1. `requirePanel` sin condominio todavía — solo rol de panel +
 *     permiso del área `finanzas` (y el contador queda fuera por no
 *     estar `/app/estados-cuenta` en `CONTADOR_MODULES`).
 *  2. El condominio de la filial se resuelve DESDE LA BASE
 *     (`condoOfProperty`), nunca del `?condoId=` de la URL, y recién
 *     ahí se comprueba que ese condominio esté entre los asignados a
 *     quien mira (`allowsCondo`). Así un supervisor no puede ver el
 *     estado de cuenta de una filial de un condominio que no es suyo
 *     con solo cambiar el id en la barra de direcciones.
 */
export default async function EstadoCuentaFilialPage({ params }: { params: { propertyId: string } }) {
  const session = await requirePanel({ module: '/app/estados-cuenta' });
  if (!session) notFound();

  const condominiumId = await condoOfProperty(session.user.companyId, params.propertyId).catch(() => null);
  if (!condominiumId || !(await allowsCondo(session, condominiumId))) notFound();

  const [header, movements, snapshot, requests] = await Promise.all([
    getStatementHeader(session.user.companyId, params.propertyId),
    listStatementMovements(session.user.companyId, params.propertyId),
    getAccountSnapshot(session.user.companyId, params.propertyId),
    listRequestsByProperty(session.user.companyId, params.propertyId),
  ]);

  const currency = header.condominium.currency;
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  let running = 0;

  return (
    <div>
      <Link
        href={`/app/estados-cuenta?condoId=${condominiumId}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal"
      >
        <ArrowLeft size={15} /> Volver a Estados de Cuenta
      </Link>

      <PageHeader
        title={`Estado de cuenta · ${header.code}`}
        subtitle={`${TYPE_LABEL[header.propertyType] ?? header.propertyType} · ${header.condominium.name}${header.ownerName ? ` · ${header.ownerName}` : ''}`}
      />

      <div
        className={`card mb-4 flex items-center gap-3 p-4 ${
          snapshot.isCurrent ? 'border-ok/40 bg-ok-bg/30' : 'border-danger/40 bg-danger-bg/30'
        }`}
      >
        {snapshot.isCurrent ? (
          <CheckCircle2 className="flex-none text-ok" size={22} />
        ) : (
          <AlertTriangle className="flex-none text-danger" size={22} />
        )}
        <div>
          <p className={`text-sm font-extrabold ${snapshot.isCurrent ? 'text-ok' : 'text-danger'}`}>
            {snapshot.isCurrent ? 'Esta filial se encuentra AL DÍA' : 'Esta filial se encuentra EN ATRASO'}
          </p>
          <p className="text-xs text-muted">
            {snapshot.isCurrent
              ? 'No tiene cobros vencidos pendientes.'
              : `${snapshot.overdueCount} cobro(s) vencido(s) por ${fmt(snapshot.overdueAmount)}.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 max-sm:grid-cols-1">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Monto cobrado</p>
          <p className="mt-1 font-sans text-2xl font-extrabold text-ink">{fmt(snapshot.charged)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Monto pagado</p>
          <p className="mt-1 font-sans text-2xl font-extrabold text-ok">{fmt(snapshot.paid)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Saldo actual</p>
          <p className={`mt-1 font-sans text-2xl font-extrabold ${snapshot.balance > 0 ? 'text-danger' : 'text-ok'}`}>
            {fmt(snapshot.balance)}
          </p>
        </div>
      </div>

      {/*
        "Aplicar pago" ya no es un formulario aparte: la casilla vive
        en la propia línea del cobro, columna "Pago" del histórico de
        abajo (`ChargePaymentCell`) — así el monto que se escribe se
        asigna a ESE cargo, no al más antiguo de la filial.
      */}
      <div className="card mt-4 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Enviar por correo</p>
        <SendStatementForm condominiumId={condominiumId} propertyId={header.id} defaultTo={header.ownerEmail} />
      </div>

      {/*
        Mismo bloque "Mis documentos y solicitudes" que ve el residente
        en `portal/estado-cuenta` — acá de solo lectura: quien aprueba
        o rechaza una solicitud lo hace desde Emisión de Documentos, no
        desde este módulo, para no duplicar ese flujo con sus propias
        reglas (plazo, plantilla, firma).
      */}
      {requests.length > 0 && (
        <div className="card mt-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Documentos y solicitudes</p>
            <Link
              href={`/app/emision-documentos?condoId=${condominiumId}`}
              className="text-xs font-semibold text-royal hover:underline"
            >
              Gestionar en Emisión de Documentos
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Fecha de solicitud</th>
                  <th className="py-2 pr-4">Fecha de aprobación</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-ink">{DOC_LABEL[r.docType] ?? r.docType}</td>
                    <td className="py-2.5 pr-4 text-muted">{fechaCorta(r.requestedAt)}</td>
                    <td className="py-2.5 pr-4 text-muted">
                      {r.status === 'aprobada' && r.decidedAt ? (
                        fechaCorta(r.decidedAt)
                      ) : r.status === 'solicitada' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-warn">
                          <Clock size={11} /> estimada {fechaCorta(r.dueBy)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusChip variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</StatusChip>
                      {r.status === 'rechazada' && r.rejectReason && (
                        <span className="ml-2 text-xs text-danger">{r.rejectReason}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.status === 'aprobada' && (
                        <Link
                          href={`/documento/${r.id}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
                        >
                          <ExternalLink size={12} /> Ver documento
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-muted">Histórico de cobros y pagos</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Fecha de registro</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">N.º de referencia</th>
              <th className="px-4 py-3 text-right">Cobro</th>
              <th className="px-4 py-3 text-right">Pago</th>
              <th className="px-4 py-3 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Sin movimientos todavía.
                </td>
              </tr>
            ) : (
              movements.map((r) => {
                running += r.charge - r.credit;
                return (
                  <tr key={r.rowKey} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-2.5 text-muted">{fechaSolo(r.date)}</td>
                    <td className="px-4 py-2.5 text-ink">{r.desc}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.charge > 0 ? fmt(r.charge) : ''}</td>
                    <td className="px-4 py-2.5">
                      {r.chargeId && (r.chargeStatus === 'pendiente' || r.chargeStatus === 'parcial') ? (
                        <ChargePaymentCell
                          condominiumId={condominiumId}
                          propertyId={header.id}
                          chargeId={r.chargeId}
                          owed={r.chargeOwed ?? r.charge}
                        />
                      ) : r.credit > 0 ? (
                        <div className="text-right">
                          <span className="block text-ok">{fmt(r.credit)}</span>
                          {/* Antes era la columna "Asociado a" aparte — se
                              trae acá para que quede junto al pago que
                              describe, y la fila gana ancho para la
                              casilla de aplicar pago + comprobante. */}
                          {r.linkedTo && <span className="block text-[11px] text-muted">{r.linkedTo}</span>}
                          {r.receiptUrl && (
                            <a
                              href={r.receiptUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold text-royal hover:underline"
                            >
                              Ver comprobante
                            </a>
                          )}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(running)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
