'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Repeat, FileSignature, Trash2, AlertTriangle, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  saveRecurringAction,
  deleteRecurringAction,
  saveContractAction,
  deleteContractAction,
  type ActionState,
} from './actions';

export type RecurringRow = {
  id: string;
  description: string;
  category: string;
  supplierName: string | null;
  amount: number;
  frequency: string;
  dayOfMonth: number;
  leadDays: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastGenerated: string | null;
};

export type ContractRow = {
  id: string;
  title: string;
  serviceType: string;
  supplierName: string;
  startDate: string;
  endDate: string;
  monthlyAmount: number | null;
  autoRenew: boolean;
  noticeDays: number;
  status: string;
  documentUrl: string | null;
  documentName: string | null;
};

export type SupplierOpt = { id: string; name: string };

const FREQ_LABEL: Record<string, string> = {
  mensual: 'Mensual',
  bimensual: 'Cada 2 meses',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

const CONTRACT_VARIANT: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  vigente: 'ok',
  por_vencer: 'warn',
  vencido: 'danger',
  cancelado: 'neutral',
};
const CONTRACT_LABEL: Record<string, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const diasPara = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);

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
          <p key={i} className="text-xs font-medium text-danger">{m?.[0]}</p>
        ))}
    </div>
  );
}

function RecurringModal({
  condominiumId,
  suppliers,
  categories,
  item,
  onDone,
}: {
  condominiumId: string;
  suppliers: SupplierOpt[];
  categories: { value: string; label: string }[];
  item?: RecurringRow;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveRecurringAction, {});
  useEffect(() => {
    if (state.success) { toast.success(item ? 'Gasto recurrente actualizado.' : 'Gasto recurrente creado.'); onDone(); }
  }, [state.success, item, onDone]);

  return (
    <Modal title={item ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente'} onClose={onDone} width="max-w-2xl">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        {item && <input type="hidden" name="id" value={item.id} />}

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Descripción</label>
            <input name="description" defaultValue={item?.description} className="field-input" placeholder="Salario del guarda diurno" />
          </div>
          <div>
            <label className="field-label">Categoría</label>
            <select name="category" defaultValue={item?.category ?? 'seguridad'} className="field-input">
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <label className="field-label">Proveedor (opcional)</label>
            <select name="supplierId" defaultValue={item ? '' : ''} className="field-input">
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Monto</label>
            <input name="amount" type="number" step="0.01" min="0" defaultValue={item?.amount ?? 0} className="field-input w-36" />
            <p className="mt-1 text-[.65rem] text-muted">0 = varía cada mes</p>
          </div>
          <div>
            <label className="field-label">Frecuencia</label>
            <select name="frequency" defaultValue={item?.frequency ?? 'mensual'} className="field-input">
              {Object.entries(FREQ_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Día de vencimiento</label>
            <input name="dayOfMonth" type="number" min="1" max="31" defaultValue={item?.dayOfMonth ?? 1} className="field-input w-28" />
          </div>
          <div>
            <label className="field-label">Crear borrador con</label>
            <input name="leadDays" type="number" min="0" max="60" defaultValue={item?.leadDays ?? 5} className="field-input w-28" />
            <p className="mt-1 text-[.65rem] text-muted">días de antelación</p>
          </div>
          <div>
            <label className="field-label">Desde</label>
            <input name="startDate" type="date" defaultValue={item?.startDate.slice(0, 10) ?? hoy()} className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Hasta (opcional)</label>
            <input name="endDate" type="date" defaultValue={item?.endDate?.slice(0, 10) ?? ''} className="field-input w-40" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" name="isActive" defaultChecked={item?.isActive ?? true} /> Activo
          </label>
        </div>

        <p className="rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">
          ANEXYpro creará el gasto en <b>borrador</b> con la antelación indicada. Nunca lo aprueba solo: el
          monto puede variar y alguien tiene que revisarlo antes de que afecte los estados financieros.
        </p>

        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Guardar" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function ContractModal({
  condominiumId,
  suppliers,
  onDone,
}: {
  condominiumId: string;
  suppliers: SupplierOpt[];
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveContractAction, {});
  useEffect(() => {
    if (state.success) { toast.success('Contrato guardado.'); onDone(); }
  }, [state.success, onDone]);

  return (
    <Modal title="Nuevo contrato" onClose={onDone} width="max-w-2xl">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Título</label>
            <input name="title" className="field-input" placeholder="Mantenimiento de jardines 2026" />
          </div>
          <div className="w-48">
            <label className="field-label">Tipo de servicio</label>
            <input name="serviceType" className="field-input" placeholder="Jardinería" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <label className="field-label">Proveedor</label>
            <select name="supplierId" className="field-input">
              <option value="">Elegí el proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Monto mensual</label>
            <input name="monthlyAmount" type="number" step="0.01" min="0" className="field-input w-36" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Inicio</label>
            <input name="startDate" type="date" defaultValue={hoy()} className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Vencimiento</label>
            <input name="endDate" type="date" className="field-input w-40" />
          </div>
          <div>
            <label className="field-label">Avisar con</label>
            <input name="noticeDays" type="number" min="0" max="365" defaultValue={30} className="field-input w-28" />
            <p className="mt-1 text-[.65rem] text-muted">días de antelación</p>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" name="autoRenew" /> Renovación automática
          </label>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="field-label">Contrato firmado (opcional)</label>
            <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="field-input text-xs" />
          </div>
        </div>
        <div>
          <label className="field-label">Notas</label>
          <textarea name="notes" rows={2} className="field-input" />
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Guardar contrato" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

export function RecurringBoard({
  condominiumId,
  currency,
  recurring,
  contracts,
  suppliers,
  categories,
  canManage,
}: {
  condominiumId: string;
  currency: string;
  recurring: RecurringRow[];
  contracts: ContractRow[];
  suppliers: SupplierOpt[];
  categories: { value: string; label: string }[];
  canManage: boolean;
}) {
  const [showRecurring, setShowRecurring] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [showContract, setShowContract] = useState(false);
  const [pending, startTransition] = useTransition();

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const alertas = contracts.filter((c) => ['por_vencer', 'vencido'].includes(c.status));
  const mensual = recurring
    .filter((r) => r.isActive && r.frequency === 'mensual')
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      {alertas.length > 0 && (
        <div className="card mb-4 border-warn/40 bg-warn-bg/30 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <AlertTriangle size={16} className="flex-none text-warn" />
            {alertas.length} contrato(s) requieren tu atención
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {alertas.map((c) => {
              const dias = diasPara(c.endDate);
              return (
                <li key={c.id}>
                  <b>{c.title}</b> ({c.supplierName}) —{' '}
                  {dias < 0 ? `venció hace ${Math.abs(dias)} días` : `vence en ${dias} días`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {/* ---------- Gastos recurrentes ---------- */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Repeat size={16} className="flex-none text-royal" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Gastos recurrentes ({recurring.length})
              </p>
              {mensual > 0 && <p className="text-[.7rem] text-muted">{fmt(mensual)} al mes comprometidos</p>}
            </div>
            {canManage && (
              <button type="button" onClick={() => setShowRecurring(true)} className="btn-ghost py-1.5 text-xs">
                <Plus size={13} /> Nuevo
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {recurring.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">
                Sin gastos recurrentes. Configurá acá los salarios, pólizas y servicios para que se creen solos
                cada mes.
              </li>
            ) : (
              recurring.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${r.isActive ? 'text-ink' : 'text-muted line-through'}`}>
                      {r.description}
                    </p>
                    <p className="text-xs text-muted">
                      {FREQ_LABEL[r.frequency]} · día {r.dayOfMonth}
                      {r.supplierName && ` · ${r.supplierName}`}
                      {r.lastGenerated && ` · último: ${fecha(r.lastGenerated)}`}
                    </p>
                  </div>
                  <p className="flex-none font-sans font-bold text-ink">
                    {r.amount > 0 ? fmt(r.amount) : <span className="text-xs font-normal text-muted">variable</span>}
                  </p>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="flex-none text-xs font-semibold text-royal hover:underline"
                      >
                        editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        title="Eliminar"
                        onClick={() => {
                          if (!window.confirm(`¿Eliminar "${r.description}"? Los gastos ya creados se conservan.`)) return;
                          startTransition(async () => {
                            const res = await deleteRecurringAction(r.id, condominiumId);
                            if (res.ok) toast.success('Eliminado.');
                            else toast.error(res.error);
                          });
                        }}
                        className="flex-none text-muted transition hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        {/* ---------- Contratos ---------- */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <FileSignature size={16} className="flex-none text-royal" />
            <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">
              Contratos ({contracts.length})
            </p>
            {canManage && (
              <button type="button" onClick={() => setShowContract(true)} className="btn-ghost py-1.5 text-xs">
                <Plus size={13} /> Nuevo
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {contracts.length === 0 ? (
              <li className="p-8 text-center text-sm text-muted">
                Sin contratos registrados. Al registrarlos, ANEXYpro avisa antes de que venzan.
              </li>
            ) : (
              contracts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{c.title}</p>
                    <p className="text-xs text-muted">
                      {c.supplierName} · {c.serviceType} · vence {fecha(c.endDate)}
                    </p>
                    {c.documentUrl && (
                      <a
                        href={c.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[.7rem] font-semibold text-royal hover:underline"
                      >
                        <Paperclip size={11} /> {c.documentName ?? 'contrato'}
                      </a>
                    )}
                  </div>
                  {c.monthlyAmount !== null && (
                    <p className="flex-none text-xs text-muted">{fmt(c.monthlyAmount)}/mes</p>
                  )}
                  <StatusChip variant={CONTRACT_VARIANT[c.status] ?? 'neutral'}>
                    {CONTRACT_LABEL[c.status] ?? c.status}
                  </StatusChip>
                  {canManage && (
                    <button
                      type="button"
                      disabled={pending}
                      title="Eliminar"
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar el contrato "${c.title}"?`)) return;
                        startTransition(async () => {
                          const res = await deleteContractAction(c.id, condominiumId);
                          if (res.ok) toast.success('Contrato eliminado.');
                          else toast.error(res.error);
                        });
                      }}
                      className="flex-none text-muted transition hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {(showRecurring || editing) && (
        <RecurringModal
          condominiumId={condominiumId}
          suppliers={suppliers}
          categories={categories}
          item={editing ?? undefined}
          onDone={() => { setShowRecurring(false); setEditing(null); }}
        />
      )}
      {showContract && (
        <ContractModal condominiumId={condominiumId} suppliers={suppliers} onDone={() => setShowContract(false)} />
      )}
    </div>
  );
}
