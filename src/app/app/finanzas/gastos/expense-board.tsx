'use client';

import { useState, useRef, useEffect, useTransition, useMemo } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Search, Paperclip, Check, Ban, Wallet, FileText, AlertTriangle, FileCode2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  createExpenseAction,
  approveExpenseAction,
  voidExpenseAction,
  payExpenseAction,
  createSupplierAction,
  readInvoiceXmlAction,
  type ActionState,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type ExpenseRow = {
  id: string;
  number: number;
  category: string;
  description: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  issueDate: string;
  dueDate: string | null;
  total: number;
  paid: number;
  status: string;
  documentUrl: string | null;
  documentName: string | null;
  createdByName: string | null;
  approvedByName: string | null;
};

export type SupplierOpt = { id: string; name: string; defaultCategory: string | null };
export type BankOpt = { id: string; name: string };

const STATUS_VARIANT: Record<string, 'neutral' | 'warn' | 'royal' | 'ok' | 'danger'> = {
  borrador: 'neutral',
  por_aprobar: 'warn',
  aprobado: 'royal',
  pagado: 'ok',
  anulado: 'danger',
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? busy : label}
    </button>
  );
}

function Errors({ state }: { state: ActionState }) {
  if (!state.formError && !state.errors) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((m, i) => (
          <p key={i} className="text-xs font-medium text-danger">
            {m?.[0]}
          </p>
        ))}
    </div>
  );
}

/**
 * Registro de gasto en una sola ventana.
 *
 * El objetivo de diseño es menos de un minuto: se pide lo mínimo, la
 * categoría se hereda del proveedor y la cuenta contable no se
 * muestra nunca — el sistema la deduce de la categoría.
 */
function NewExpenseModal({
  condominiumId,
  currency,
  suppliers,
  categories,
  onDone,
}: {
  condominiumId: string;
  currency: string;
  suppliers: SupplierOpt[];
  categories: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createExpenseAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('mantenimiento');
  const [subtotal, setSubtotal] = useState('');
  const [tax, setTax] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [showSupplier, setShowSupplier] = useState(false);
  const [description, setDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState(hoy());
  const [xmlNote, setXmlNote] = useState<string | null>(null);
  const [readingXml, setReadingXml] = useState(false);

  /**
   * Lee el XML de Hacienda y precarga todo. Es el camino EXACTO: el
   * proveedor, las fechas y los montos vienen del comprobante mismo,
   * no de una interpretación.
   */
  const onXml = async (file: File) => {
    setReadingXml(true);
    setXmlNote(null);
    try {
      const fd = new FormData();
      fd.set('xml', file);
      const r = await readInvoiceXmlAction(fd);
      if (!r.ok || !r.data) {
        setXmlNote(r.error ?? 'No se pudo leer el XML.');
        return;
      }
      const d = r.data;
      if (d.supplierId) setSupplierId(d.supplierId);
      if (d.suggestedCategory) setCategory(d.suggestedCategory);
      if (d.description) setDescription(d.description);
      if (d.invoiceNumber) setInvoiceNumber(d.invoiceNumber);
      if (d.issueDate) setIssueDate(d.issueDate);
      if (d.subtotal !== null) setSubtotal(String(d.subtotal));
      if (d.taxAmount !== null) setTax(String(d.taxAmount));
      setXmlNote(
        d.supplierId
          ? `Datos tomados del comprobante de ${d.supplierName ?? 'el proveedor'}.`
          : `Comprobante de ${d.supplierName ?? 'un proveedor'} (céd. ${d.supplierTaxId ?? '—'}). Ese proveedor no está registrado: agregalo o dejá el gasto sin proveedor.`
      );
    } finally {
      setReadingXml(false);
    }
  };

  useEffect(() => {
    if (state.success) {
      toast.success('Gasto registrado.');
      onDone();
    }
  }, [state.success, onDone]);

  // Al elegir proveedor se hereda la categoría que usó la última vez.
  const onSupplier = (id: string) => {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s?.defaultCategory) setCategory(s.defaultCategory);
  };

  const total = (Number(subtotal) || 0) + (Number(tax) || 0);
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

  return (
    <Modal title="Nuevo gasto" subtitle="Adjuntá la factura y revisá los datos" onClose={onDone} width="max-w-3xl">
      <form ref={formRef} action={formAction} className="p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />

        <div className="grid grid-cols-[220px_1fr] gap-5 max-lg:grid-cols-1">
          {/* Documento a la izquierda: se verifica mirando, no recordando */}
          <div>
            <label className="field-label">Factura</label>
            <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-royal/30 bg-royal-soft px-3 py-2 text-xs font-semibold text-royal transition hover:bg-royal/10">
              <FileCode2 size={14} className="flex-none" />
              {readingXml ? 'Leyendo…' : 'Leer XML de Hacienda'}
              <input
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onXml(f);
                }}
              />
            </label>
            <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-canvas p-3 text-center transition hover:border-royal">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Factura" className="max-h-32 rounded object-contain" />
              ) : (
                <>
                  <FileText className="text-muted" size={22} />
                  <span className="text-xs text-muted">Arrastrá o elegí el archivo</span>
                  <span className="text-[.65rem] text-muted">PDF, JPG o PNG</span>
                </>
              )}
              <input
                name="document"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && f.type.startsWith('image/')) setPreview(URL.createObjectURL(f));
                  else setPreview(null);
                }}
              />
            </label>
            {xmlNote && (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-canvas px-2 py-1.5 text-[.68rem] leading-snug text-muted">
                <Sparkles size={11} className="mt-0.5 flex-none text-royal" />
                {xmlNote}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="field-label">Proveedor</label>
                <button
                  type="button"
                  onClick={() => setShowSupplier(true)}
                  className="text-[.7rem] font-semibold text-royal hover:underline"
                >
                  + nuevo
                </button>
              </div>
              <select
                name="supplierId"
                value={supplierId}
                onChange={(e) => onSupplier(e.target.value)}
                className="field-input"
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Descripción</label>
              <input
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Póliza de incendio — julio 2026"
                className="field-input"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-40 flex-1">
                <label className="field-label">Categoría</label>
                <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="field-input">
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Fecha de la factura</label>
                <input
                  name="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="field-input w-40"
                />
              </div>
              <div>
                <label className="field-label">Vence (opcional)</label>
                <input name="dueDate" type="date" className="field-input w-40" />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="field-label">Monto</label>
                <input
                  name="subtotal"
                  type="number"
                  step="0.01"
                  min="0"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  className="field-input w-36"
                />
              </div>
              <div>
                <label className="field-label">Impuesto</label>
                <input
                  name="taxAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0"
                  className="field-input w-32"
                />
              </div>
              <div>
                <label className="field-label">N.º de factura</label>
                <input
                  name="invoiceNumber"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="field-input w-40"
                />
              </div>
              {total > 0 && (
                <p className="pb-2 font-sans text-base font-bold text-ink">Total {fmt(total)}</p>
              )}
            </div>
          </div>
        </div>

        <Errors state={state} />

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <Submit label="Guardar gasto" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
          <p className="ml-auto text-[.7rem] text-muted">
            La cuenta contable se asigna sola según la categoría.
          </p>
        </div>
      </form>

      {showSupplier && <NewSupplierModal onDone={() => setShowSupplier(false)} />}
    </Modal>
  );
}

function NewSupplierModal({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createSupplierAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Proveedor agregado. Volvé a abrir la lista para elegirlo.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title="Nuevo proveedor" onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <div>
          <label className="field-label">Razón social</label>
          <input name="legalName" className="field-input" placeholder="Seguros del Istmo S.A." />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Nombre comercial (opcional)</label>
            <input name="tradeName" className="field-input" />
          </div>
          <div>
            <label className="field-label">Cédula jurídica</label>
            <input name="taxId" className="field-input w-40" placeholder="3-101-000000" />
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Correo</label>
            <input name="email" type="email" className="field-input" />
          </div>
          <div>
            <label className="field-label">Teléfono</label>
            <input name="phone" className="field-input w-36" />
          </div>
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-2">
          <Submit label="Agregar" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PayModal({
  expense,
  condominiumId,
  banks,
  currency,
  onDone,
}: {
  expense: ExpenseRow;
  condominiumId: string;
  banks: BankOpt[];
  currency: string;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(payExpenseAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Pago registrado.');
      onDone();
    }
  }, [state.success, onDone]);

  const pending = expense.total - expense.paid;
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

  return (
    <Modal title={`Pagar gasto #${expense.number}`} subtitle={expense.description} onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="expenseId" value={expense.id} />
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-ink">
          Saldo pendiente: <b>{fmt(pending)}</b>
        </p>
        <div className="flex gap-3">
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" defaultValue={pending} className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Fecha</label>
            <input name="paymentDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
          <div className="flex-1">
            <label className="field-label">Medio</label>
            <select name="method" defaultValue="transferencia" className="field-input">
              <option value="transferencia">Transferencia</option>
              <option value="sinpe">SINPE</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="deposito">Depósito</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Cuenta bancaria</label>
            <select name="bankAccountId" className="field-input">
              <option value="">Sin especificar</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="field-label">Referencia</label>
            <input name="reference" className="field-input" />
          </div>
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-2">
          <Submit label="Registrar pago" busy="Registrando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExpenseBoard({
  condominiumId,
  currency,
  expenses,
  suppliers,
  banks,
  categories,
  canApprove,
  canRegister,
}: {
  condominiumId: string;
  currency: string;
  expenses: ExpenseRow[];
  suppliers: SupplierOpt[];
  banks: BankOpt[];
  categories: { value: string; label: string }[];
  canApprove: boolean;
  canRegister: boolean;
}) {
  const [showNew, setShowNew] = useState(false);
  const [paying, setPaying] = useState<ExpenseRow | null>(null);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (status && e.status !== status) return false;
      if (category && e.category !== category) return false;
      if (q && !`${e.description} ${e.supplierName ?? ''} ${e.invoiceNumber ?? ''} #${e.number}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [expenses, status, category, query]);

  const live = expenses.filter((e) => e.status !== 'anulado');
  const total = live.reduce((s, e) => s + e.total, 0);
  const paid = live.reduce((s, e) => s + e.paid, 0);
  const awaiting = expenses.filter((e) => e.status === 'por_aprobar');

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Gasto del período</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{fmt(total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Pagado</p>
          <p className="mt-1 font-sans text-xl font-bold text-ok">{fmt(paid)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Por pagar</p>
          <p className="mt-1 font-sans text-xl font-bold text-warn">{fmt(total - paid)}</p>
        </div>
        <div className={`card p-4 ${awaiting.length ? 'border-warn/40' : ''}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Esperan aprobación</p>
          <p className="mt-1 font-sans text-xl font-bold text-ink">{awaiting.length}</p>
          {awaiting.length > 0 && (
            <p className="text-[.7rem] text-warn">{fmt(awaiting.reduce((s, e) => s + e.total, 0))}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field-input w-auto">
          <option value="">Todo estado</option>
          <option value="por_aprobar">Por aprobar</option>
          <option value="aprobado">Aprobado</option>
          <option value="pagado">Pagado</option>
          <option value="anulado">Anulado</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input w-auto">
          <option value="">Toda categoría</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por descripción, proveedor o factura…"
            className="field-input pl-9"
          />
        </div>
        {canRegister && (
          <button type="button" onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={15} /> Nuevo gasto
          </button>
        )}
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">N.º</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted">
                  <Wallet className="mx-auto mb-2 text-muted" size={22} />
                  {expenses.length === 0
                    ? 'Todavía no hay gastos registrados en este condominio.'
                    : 'Ningún gasto coincide con los filtros.'}
                </td>
              </tr>
            ) : (
              visible.map((e) => {
                const pendiente = e.total - e.paid;
                return (
                  <tr key={e.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-muted">#{e.number}</td>
                    <td className="px-4 py-3 text-muted">{fecha(e.issueDate)}</td>
                    <td className="px-4 py-3 text-ink">{e.supplierName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{e.description}</p>
                      {e.invoiceNumber && <p className="text-[.7rem] text-muted">Factura {e.invoiceNumber}</p>}
                      {e.documentUrl && (
                        <a
                          href={e.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[.7rem] font-semibold text-royal hover:underline"
                        >
                          <Paperclip size={11} /> {e.documentName ?? 'documento'}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {categories.find((c) => c.value === e.category)?.label ?? e.category}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-sans font-bold text-ink">{fmt(e.total)}</p>
                      {e.paid > 0 && pendiente > 0 && (
                        <p className="text-[.7rem] text-warn">falta {fmt(pendiente)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip variant={STATUS_VARIANT[e.status] ?? 'neutral'}>
                        {e.status === 'por_aprobar' ? 'Por aprobar' : e.status}
                      </StatusChip>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canApprove && e.status === 'por_aprobar' && (
                          <button
                            type="button"
                            disabled={pending}
                            title="Aprobar"
                            onClick={() =>
                              enTransicion(startTransition, async () => {
                                const r = await approveExpenseAction(e.id, condominiumId);
                                if (r.ok) toast.success('Gasto aprobado.');
                                else toast.error(r.error);
                              })
                            }
                            className="text-ok transition hover:opacity-70"
                          >
                            <Check size={16} />
                          </button>
                        )}
                        {canRegister && ['aprobado'].includes(e.status) && pendiente > 0 && (
                          <button
                            type="button"
                            title="Registrar pago"
                            onClick={() => setPaying(e)}
                            className="text-royal transition hover:opacity-70"
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        {canApprove && !['anulado', 'pagado'].includes(e.status) && (
                          <button
                            type="button"
                            disabled={pending}
                            title="Anular"
                            onClick={() => {
                              const reason = window.prompt(`¿Por qué se anula el gasto #${e.number}?`);
                              if (!reason) return;
                              enTransicion(startTransition, async () => {
                                const r = await voidExpenseAction(e.id, condominiumId, reason);
                                if (r.ok) toast.success('Gasto anulado.');
                                else toast.error(r.error);
                              });
                            }}
                            className="text-muted transition hover:text-danger"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {awaiting.length > 0 && canApprove && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-warn-bg/50 px-3 py-2 text-xs text-ink">
          <AlertTriangle size={14} className="flex-none text-warn" />
          Hay {awaiting.length} gasto(s) esperando tu aprobación. Mientras no se aprueben, no afectan el
          Estado de Resultados.
        </p>
      )}

      {showNew && (
        <NewExpenseModal
          condominiumId={condominiumId}
          currency={currency}
          suppliers={suppliers}
          categories={categories}
          onDone={() => setShowNew(false)}
        />
      )}
      {paying && (
        <PayModal
          expense={paying}
          condominiumId={condominiumId}
          banks={banks}
          currency={currency}
          onDone={() => setPaying(null)}
        />
      )}
    </div>
  );
}
