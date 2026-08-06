import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getIssuedDocument, DOC_TYPE_LABEL } from '@/lib/services/document-requests';
import { getResidentContext } from '@/lib/services/resident-context';
import { PrintButton } from './print-button';

/**
 * Documento formal emitido: certificación de cuotas al día o estado
 * de cuenta. Se abre listo para imprimir o guardar como PDF desde el
 * navegador. El diseño (logo, color, encabezado, pie y datos de la
 * administradora) sale de la plantilla del condominio.
 */
export default async function DocumentoPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const data = await getIssuedDocument(session.user.companyId, params.id);
  if (!data) notFound();
  const { request, template, charges, payments } = data;

  // El condómino solo puede ver documentos de SU propia filial.
  if (session.user.role === 'condomino') {
    const ctx = await getResidentContext(session.user.id);
    if (!ctx || ctx.property.id !== request.propertyId) notFound();
  }
  if (request.status !== 'aprobada') notFound();

  const currency = request.condominium.currency;
  const fmt = (n: unknown) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n ?? 0));
  const fecha = (d: Date) => new Date(d).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });

  const owner = request.person.fullName;
  const isCurrent = request.issuedCurrent ?? true;
  const color = template.primaryColor || '#3B6EF5';

  const movements = [
    ...charges.map((c) => ({
      date: new Date(c.dueDate),
      desc: c.description,
      charge: Number(c.amount),
      credit: 0,
    })),
    ...payments.map((p) => ({
      date: new Date(p.paymentDate),
      desc: `Pago recibido${p.reference ? ` · ref. ${p.reference}` : ''} (${p.method})`,
      charge: 0,
      credit: Number(p.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  let running = 0;

  return (
    <div className="min-h-screen bg-canvas py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[820px] items-center justify-between px-6 print:hidden">
        <a href="javascript:history.back()" className="btn-ghost py-1.5 text-xs">
          ← Volver
        </a>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[820px] bg-white p-12 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* ---------- Encabezado ---------- */}
        <header className="flex items-start justify-between gap-6 border-b-4 pb-5" style={{ borderColor: color }}>
          <div className="flex items-center gap-4">
            {template.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={template.logoUrl} alt="" className="h-16 w-16 object-contain" />
            )}
            <div>
              <h1 className="font-sans text-xl font-extrabold" style={{ color }}>
                {template.headerText || request.condominium.name}
              </h1>
              {template.adminName && <p className="text-sm font-semibold text-ink">{template.adminName}</p>}
              {template.adminDetails && <p className="text-xs text-muted">{template.adminDetails}</p>}
            </div>
          </div>
          <div className="text-right text-xs text-muted">
            <p className="font-semibold uppercase tracking-wide" style={{ color }}>
              {DOC_TYPE_LABEL[request.docType]}
            </p>
            <p className="mt-1">Emitido el {fecha(request.decidedAt ?? request.requestedAt)}</p>
            <p className="font-mono">N.º {request.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </header>

        {/* ---------- Datos de la filial ---------- */}
        <section className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 text-sm">
          <Field label="Condominio" value={request.condominium.name} />
          <Field label="Número de filial" value={request.property.code} />
          <Field label="Propietario / solicitante" value={owner} />
          <Field label="Fecha de emisión" value={fecha(request.decidedAt ?? new Date())} />
        </section>

        {/* ---------- Sello de estado ---------- */}
        <div
          className="mt-6 rounded-lg border-2 px-5 py-3"
          style={{
            borderColor: isCurrent ? '#10B981' : '#EF4444',
            background: isCurrent ? '#D1FAE520' : '#FEE2E220',
          }}
        >
          <p className="text-sm font-extrabold uppercase tracking-wide" style={{ color: isCurrent ? '#047857' : '#B91C1C' }}>
            {isCurrent ? '✓ La propiedad se encuentra AL DÍA' : '⚠ La propiedad se encuentra EN ATRASO'}
          </p>
          <p className="mt-0.5 text-xs text-ink">
            Saldo a la fecha de emisión: <b>{fmt(request.issuedBalance ?? 0)}</b>
          </p>
        </div>

        {/* ---------- Cuerpo ---------- */}
        {request.bodyText && (
          <section className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-ink">{request.bodyText}</section>
        )}

        {/* ---------- Resumen y movimientos (estado de cuenta) ---------- */}
        {request.docType === 'estado_cuenta' && (
          <section className="mt-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Total label="Monto cobrado" value={fmt(request.issuedCharged ?? 0)} />
              <Total label="Monto pagado" value={fmt(request.issuedPaid ?? 0)} />
              <Total
                label="Saldo pendiente"
                value={fmt(request.issuedBalance ?? 0)}
                emphasis={Number(request.issuedBalance ?? 0) > 0 ? '#B91C1C' : '#047857'}
              />
            </div>

            <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide" style={{ color }}>
              Histórico de cobros y pagos
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2" style={{ borderColor: color }}>
                  <th className="py-2 text-left font-bold text-ink">Fecha</th>
                  <th className="py-2 text-left font-bold text-ink">Detalle</th>
                  <th className="py-2 text-right font-bold text-ink">Cobrado</th>
                  <th className="py-2 text-right font-bold text-ink">Pagado</th>
                  <th className="py-2 text-right font-bold text-ink">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted">
                      Sin movimientos registrados.
                    </td>
                  </tr>
                ) : (
                  movements.map((m, i) => {
                    running += m.charge - m.credit;
                    return (
                      <tr key={i} className="border-b border-line">
                        <td className="py-1.5 text-muted">{new Date(m.date).toLocaleDateString('es-CR')}</td>
                        <td className="py-1.5 text-ink">{m.desc}</td>
                        <td className="py-1.5 text-right">{m.charge > 0 ? fmt(m.charge) : ''}</td>
                        <td className="py-1.5 text-right">{m.credit > 0 ? fmt(m.credit) : ''}</td>
                        <td className="py-1.5 text-right font-semibold">{fmt(running)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </section>
        )}

        {/* ---------- Firma ---------- */}
        <section className="mt-12">
          {/*
            La firma escaneada va ENCIMA de la línea, no debajo: es la
            rúbrica sobre el trazo, como en un documento en papel. Si no
            se cargó ninguna imagen, queda el espacio en blanco para
            firmar a mano después de imprimir.
          */}
          {template.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={template.signatureUrl}
              alt=""
              className="mb-1 h-16 w-56 object-contain object-left"
            />
          ) : (
            <div className="h-16" />
          )}
          <div className="w-64 border-t border-ink pt-2">
            <p className="text-sm font-semibold text-ink">{template.signerName || template.adminName || 'Administración'}</p>
            <p className="text-xs text-muted">{template.signerTitle || 'Administración'}</p>
            <p className="text-xs text-muted">{request.condominium.name}</p>
          </div>
        </section>

        {/* ---------- Pie ---------- */}
        <footer className="mt-10 border-t pt-3 text-center text-[.65rem] leading-relaxed text-muted" style={{ borderColor: color }}>
          {template.footerText && <p>{template.footerText}</p>}
          <p>
            Documento emitido electrónicamente por {template.adminName || 'la Administración'} · Ante cualquier duda sobre
            este documento, contacte a la Administración.
          </p>
        </footer>
      </article>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[.65rem] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-medium text-ink">{value}</p>
    </div>
  );
}

function Total({ label, value, emphasis }: { label: string; value: string; emphasis?: string }) {
  return (
    <div className="rounded-lg bg-canvas px-4 py-3 print:border print:border-line print:bg-white">
      <p className="text-[.65rem] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-sans text-base font-extrabold" style={emphasis ? { color: emphasis } : undefined}>
        {value}
      </p>
    </div>
  );
}
