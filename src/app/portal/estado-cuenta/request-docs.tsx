'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { FileCheck2, FileText, Clock, Info, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { requestDocumentAction } from './actions';

export type DocRequestRow = {
  id: string;
  docType: string;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  dueBy: string;
  rejectReason: string | null;
};

const DOC_LABEL: Record<string, string> = {
  certificacion_cuotas_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};
const STATUS_LABEL: Record<string, string> = { solicitada: 'En trámite', aprobada: 'Emitido', rechazada: 'Rechazada' };
const STATUS_VARIANT: Record<string, 'warn' | 'ok' | 'danger'> = { solicitada: 'warn', aprobada: 'ok', rechazada: 'danger' };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' });

export function RequestDocs({
  requests,
  isCurrent,
  overdueCount,
}: {
  requests: DocRequestRow[];
  isCurrent: boolean;
  overdueCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (docType: 'certificacion_cuotas_al_dia' | 'estado_cuenta') =>
    startTransition(async () => {
      const r = await requestDocumentAction(docType);
      if (r.ok) {
        toast.success('Solicitud enviada. Recibirás el documento en un plazo de 2 días hábiles.');
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });

  return (
    <div className="card mt-5 p-5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <FileCheck2 size={16} className="flex-none text-royal" />
        <span className="flex-1">
          <span className="block text-sm font-bold text-ink">Solicitud de emisión de documentos</span>
          <span className="block text-xs text-muted">Certificación de cuotas al día y estado de cuenta</span>
        </span>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-royal-soft px-3 py-2.5">
            <Info size={14} className="mt-0.5 flex-none text-royal" />
            <p className="text-xs leading-relaxed text-ink">
              El documento se entregará en un plazo de <b>2 días hábiles</b>. En caso de que haya alguna duda con el
              estado de cuenta, debe contactarse con la Administración.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            {/* Certificación — solo si la filial está al día */}
            <div className="rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileCheck2 size={15} className="text-ok" /> Certificación de cuotas al día
              </p>
              <p className="mt-1 text-xs text-muted">
                Hace constar que tu filial no tiene cobros pendientes a la fecha de emisión.
              </p>
              {isCurrent ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit('certificacion_cuotas_al_dia')}
                  className="btn-primary mt-3 w-full py-2 text-xs disabled:opacity-50"
                >
                  {pending ? 'Enviando…' : 'Solicitar certificación'}
                </button>
              ) : (
                <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger">
                  No disponible: tu filial tiene {overdueCount} cobro(s) atrasado(s). Ponte al día o contacta a la
                  Administración.
                </p>
              )}
            </div>

            {/* Estado de cuenta — siempre disponible */}
            <div className="rounded-xl border border-line p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileText size={15} className="text-royal" /> Estado de cuenta
              </p>
              <p className="mt-1 text-xs text-muted">
                Documento formal con el histórico de cobros y pagos, y la condición de tu propiedad.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit('estado_cuenta')}
                className="btn-primary mt-3 w-full py-2 text-xs disabled:opacity-50"
              >
                {pending ? 'Enviando…' : 'Solicitar estado de cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Mis documentos y solicitudes</p>
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
                      {r.approvedAt ? (
                        fechaCorta(r.approvedAt)
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
    </div>
  );
}
