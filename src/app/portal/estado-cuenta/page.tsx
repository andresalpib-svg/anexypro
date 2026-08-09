import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listChargesByProperty, listPaymentsByProperty } from '@/lib/services/finance';
import { getAccountSnapshot, listRequestsByProperty } from '@/lib/services/document-requests';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { RequestDocs } from './request-docs';

export default async function StatementPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const [charges, payments, snapshot, requests] = await Promise.all([
    listChargesByProperty(session!.user.companyId, ctx.property.id),
    listPaymentsByProperty(session!.user.companyId, ctx.property.id),
    getAccountSnapshot(session!.user.companyId, ctx.property.id),
    listRequestsByProperty(session!.user.companyId, ctx.property.id),
  ]);
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency: ctx.condominium.currency, maximumFractionDigits: 0 }).format(n);

  const rows = [
    ...charges.map((c) => ({
      date: c.dueDate,
      desc: c.description,
      reference: '',
      charge: Number(c.amount),
      credit: 0,
      linkedTo: '',
    })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      desc: `Pago recibido · ${p.method}`,
      reference: p.reference ?? '',
      charge: 0,
      credit: Number(p.amount),
      // A qué cobro se aplicó el pago (puede cubrir varios).
      linkedTo:
        p.allocations.length > 0
          ? p.allocations.map((a) => a.charge.description).join(' · ')
          : 'Saldo a favor',
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;

  return (
    <div>
      <PageHeader
        title="Estado de Cuenta"
        subtitle={`${ctx.property.code} · ${ctx.condominium.name}`}
      />

      {/* ---------- Señal de condición ---------- */}
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
            {snapshot.isCurrent ? 'Tu propiedad se encuentra AL DÍA' : 'Tu propiedad se encuentra EN ATRASO'}
          </p>
          <p className="text-xs text-muted">
            {snapshot.isCurrent
              ? 'No tienes cobros vencidos pendientes.'
              : `${snapshot.overdueCount} cobro(s) vencido(s) por ${fmt(snapshot.overdueAmount)}.`}
          </p>
        </div>
      </div>

      {/* ---------- Totales ---------- */}
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

      {/* ---------- Solicitud de documentos ---------- */}
      <RequestDocs
        isCurrent={snapshot.isCurrent}
        overdueCount={snapshot.overdueCount}
        requests={requests.map((r) => ({
          id: r.id,
          docType: r.docType,
          status: r.status,
          requestedAt: r.requestedAt.toISOString(),
          approvedAt: r.status === 'aprobada' && r.decidedAt ? r.decidedAt.toISOString() : null,
          dueBy: r.dueBy.toISOString(),
          rejectReason: r.rejectReason,
        }))}
      />

      {/* ---------- Histórico ---------- */}
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
              <th className="px-4 py-3">Asociado a</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Sin movimientos todavía.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                running += r.charge - r.credit;
                return (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-muted">{fechaSolo(r.date)}</td>
                    <td className="px-4 py-2.5 text-ink">{r.desc}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.charge > 0 ? fmt(r.charge) : ''}</td>
                    <td className="px-4 py-2.5 text-right text-ok">{r.credit > 0 ? fmt(r.credit) : ''}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(running)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{r.linkedTo || '—'}</td>
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
