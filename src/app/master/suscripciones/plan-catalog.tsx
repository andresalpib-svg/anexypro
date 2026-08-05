'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { savePlanAction, deletePlanAction, type ActionState } from './actions';

const VACIO: ActionState = {};

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  period: string;
  maxCondominiums: number;
  graceDays: number;
  isActive: boolean;
  sortOrder: number;
  empresas: number;
};

const PERIODO: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

export function PlanCatalog({ planes }: { planes: Plan[] }) {
  const [editando, setEditando] = useState<Plan | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Planes</h2>
          <p className="mt-0.5 text-xs text-muted">
            Precio, periodicidad, tope de condominios y días hábiles de plazo antes de que corresponda
            bloquear.
          </p>
        </div>
        <button type="button" onClick={() => setCreando(true)} className="btn-primary">
          <Plus size={16} /> Nuevo plan
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {planes.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas p-6 text-center text-sm text-muted">
          Todavía no hay planes. Sin ellos no se puede asignar suscripción a ninguna empresa.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Precio</th>
                <th className="py-2 pr-3">Periodicidad</th>
                <th className="py-2 pr-3">Condominios</th>
                <th className="py-2 pr-3">Plazo</th>
                <th className="py-2 pr-3">Empresas</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {planes.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3">
                    <span className="block font-semibold text-ink">{p.name}</span>
                    {p.description && <span className="block text-xs text-muted">{p.description}</span>}
                  </td>
                  <td className="py-3 pr-3 text-ink">
                    {p.currency} {p.price.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-3 text-muted">{PERIODO[p.period] ?? p.period}</td>
                  <td className="py-3 pr-3 text-muted">
                    {p.maxCondominiums === 0 ? 'Sin tope' : `Hasta ${p.maxCondominiums}`}
                  </td>
                  <td className="py-3 pr-3 text-muted">{p.graceDays} días hábiles</td>
                  <td className="py-3 pr-3 text-muted">{p.empresas}</td>
                  <td className="py-3 pr-3">
                    <StatusChip variant={p.isActive ? 'ok' : 'neutral'}>
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </StatusChip>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditando(p)}
                        title="Editar"
                        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          start(async () => {
                            const r = await deletePlanAction(p.id);
                            if (!r.ok) setError(r.error ?? 'No se pudo eliminar.');
                            router.refresh();
                          })
                        }
                        title="Eliminar"
                        className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creando || editando) && (
        <PlanForm
          plan={editando}
          onClose={() => {
            setCreando(false);
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function PlanForm({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const [state, formAction] = useFormState(savePlanAction, VACIO);

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <Modal title={plan ? `Editar ${plan.name}` : 'Nuevo plan'} onClose={onClose}>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="planId" value={plan?.id ?? ''} />

        <Campo label="Nombre" error={state.errors?.name?.[0]}>
          <input name="name" defaultValue={plan?.name} placeholder="Plan Mensual" className="field-input w-full" />
        </Campo>
        <Campo label="Descripción">
          <input name="description" defaultValue={plan?.description ?? ''} className="field-input w-full" />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Precio">
            <input name="price" type="number" min={0} step="0.01" defaultValue={plan?.price ?? 0} className="field-input w-full" />
          </Campo>
          <Campo label="Moneda">
            <select name="currency" defaultValue={plan?.currency ?? 'CRC'} className="field-input w-full">
              <option value="CRC">CRC</option>
              <option value="USD">USD</option>
            </select>
          </Campo>
          <Campo label="Periodicidad">
            <select name="period" defaultValue={plan?.period ?? 'mensual'} className="field-input w-full">
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option>
              <option value="anual">Anual</option>
            </select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Condominios permitidos (0 = sin tope)">
            <input
              name="maxCondominiums"
              type="number"
              min={0}
              defaultValue={plan?.maxCondominiums ?? 0}
              className="field-input w-full"
            />
          </Campo>
          <Campo label="Plazo de pago (días hábiles)">
            <input name="graceDays" type="number" min={0} max={30} defaultValue={plan?.graceDays ?? 5} className="field-input w-full" />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Orden">
            <input name="sortOrder" type="number" min={0} defaultValue={plan?.sortOrder ?? 0} className="field-input w-full" />
          </Campo>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} value="on" /> Activo
          </label>
        </div>

        {state.formError && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <Guardar />
        </div>
      </form>
    </Modal>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Guardar plan'}
    </button>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
