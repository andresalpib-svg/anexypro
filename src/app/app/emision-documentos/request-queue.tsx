'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { FileCheck2, FileText, Clock, ExternalLink, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { approveRequestAction, rejectRequestAction, type ActionState } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type QueueRow = {
  id: string;
  docType: string;
  status: string;
  propertyCode: string;
  personName: string;
  requestedAt: string;
  dueBy: string;
  bodyText: string | null;
  rejectReason: string | null;
  decidedByName: string | null;
  isCurrent: boolean | null;
  overdueCount: number | null;
  overdueAmount: number | null;
};

const DOC_LABEL: Record<string, string> = {
  certificacion_cuotas_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};
const STATUS_LABEL: Record<string, string> = { solicitada: 'En trámite', aprobada: 'Emitido', rechazada: 'Rechazada' };
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger'> = { solicitada: 'warn', aprobada: 'ok', rechazada: 'danger' };

function EmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      <CheckCircle2 size={14} /> {pending ? 'Emitiendo…' : 'Aprobar y emitir'}
    </button>
  );
}

function RequestCard({ row, currency }: { row: QueueRow; currency: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(approveRequestAction, {});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      toast.success('Documento emitido — ya está disponible en el estado de cuenta del residente.');
      setOpen(false);
    }
  }, [state.success]);

  const Icon = row.docType === 'certificacion_cuotas_al_dia' ? FileCheck2 : FileText;
  const blocked = row.docType === 'certificacion_cuotas_al_dia' && row.isCurrent === false;
  const fmt = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="border-b border-line p-4 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <Icon size={16} className="flex-none text-royal" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {DOC_LABEL[row.docType] ?? row.docType}
            <span className="ml-2 text-sm font-normal text-muted">
              {row.propertyCode} · {row.personName}
            </span>
          </p>
          <p className="text-xs text-muted">
            Solicitado el {new Date(row.requestedAt).toLocaleDateString('es-CR')}
            {row.status === 'solicitada' && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 font-semibold text-warn">
                  <Clock size={11} /> entrega antes del{' '}
                  {new Date(row.dueBy).toLocaleDateString('es-CR', { day: 'numeric', month: 'long' })}
                </span>
              </>
            )}
            {row.decidedByName && ` · resuelto por ${row.decidedByName}`}
          </p>
          {row.status === 'rechazada' && row.rejectReason && (
            <p className="mt-0.5 text-xs text-danger">Motivo: {row.rejectReason}</p>
          )}
        </div>
        <StatusChip variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</StatusChip>
        {row.status === 'aprobada' && (
          <Link
            href={`/documento/${row.id}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-royal hover:underline"
          >
            <ExternalLink size={12} /> Ver documento
          </Link>
        )}
        {row.status === 'solicitada' && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-ghost py-1.5 text-xs">
            {open ? 'Cerrar' : 'Revisar'}
          </button>
        )}
      </div>

      {open && row.status === 'solicitada' && (
        <div className="mt-3 rounded-lg bg-canvas p-4">
          {row.isCurrent === false ? (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger">
              <AlertTriangle size={14} className="mt-0.5 flex-none" />
              La filial tiene {row.overdueCount} cobro(s) atrasado(s) por {fmt(row.overdueAmount ?? 0)}.
              {blocked
                ? ' No se puede emitir la certificación de cuotas al día hasta que se ponga al día.'
                : ' El estado de cuenta se emitirá indicando que la propiedad está EN ATRASO.'}
            </p>
          ) : (
            <p className="mb-3 flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-xs font-medium text-ok">
              <CheckCircle2 size={14} /> La filial está al día — el documento se emitirá con el sello AL DÍA.
            </p>
          )}

          <form action={formAction}>
            <input type="hidden" name="requestId" value={row.id} />
            <label className="field-label">Cuerpo del documento (editable)</label>
            <textarea name="bodyText" defaultValue={row.bodyText ?? ''} rows={5} className="field-input text-sm" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!blocked && <EmitButton />}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const reason = window.prompt('Motivo del rechazo (lo verá el residente):');
                  if (reason === null) return;
                  enTransicion(startTransition, async () => {
                    const r = await rejectRequestAction(row.id, reason);
                    if (r.ok) toast.success('Solicitud rechazada.');
                    else toast.error(r.error);
                  });
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
              >
                <XCircle size={14} /> Rechazar solicitud
              </button>
            </div>
            {state.formError && <p className="mt-2 text-xs font-medium text-danger">{state.formError}</p>}
          </form>
        </div>
      )}
    </div>
  );
}

export function RequestQueue({ rows, currency }: { rows: QueueRow[]; currency: string }) {
  const pending = rows.filter((r) => r.status === 'solicitada');
  const resolved = rows.filter((r) => r.status !== 'solicitada');

  return (
    <>
      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-muted">
        Solicitudes en trámite ({pending.length})
      </p>
      <div className="card overflow-hidden">
        {pending.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">Sin solicitudes pendientes.</p>
        ) : (
          pending.map((r) => <RequestCard key={r.id} row={r} currency={currency} />)
        )}
      </div>

      {resolved.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-muted">
            Documentos emitidos y resueltos ({resolved.length})
          </p>
          <div className="card overflow-hidden">
            {resolved.map((r) => (
              <RequestCard key={r.id} row={r} currency={currency} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
