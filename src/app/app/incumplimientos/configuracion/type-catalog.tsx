'use client';

import { useState, useTransition, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Eye, EyeOff, Gavel } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { TEMPLATE_VARS } from '@/lib/domain/violations';
import {
  saveViolationTypeAction,
  toggleViolationTypeAction,
  deleteViolationTypeAction,
  type ActionState,
} from '../actions';

export type Tipo = {
  id: string;
  name: string;
  description: string | null;
  regulationArticle: string | null;
  warningsRequired: number;
  daysBetween: number;
  fineAmount: number;
  immediateFine: boolean;
  warningTemplate: string | null;
  secondWarningTemplate: string | null;
  fineTemplate: string | null;
  sortOrder: number;
  isActive: boolean;
};

const VACIO: ActionState = {};

export function TypeCatalog({ condominiumId, tipos }: { condominiumId: string; tipos: Tipo[] }) {
  const [editando, setEditando] = useState<Tipo | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function alternar(t: Tipo) {
    start(async () => {
      const r = await toggleViolationTypeAction(t.id, !t.isActive);
      if (!r.ok) setError(r.error ?? 'No se pudo actualizar.');
      router.refresh();
    });
  }

  function eliminar(t: Tipo) {
    start(async () => {
      const r = await deleteViolationTypeAction(t.id);
      if (!r.ok) setError(r.error ?? 'No se pudo eliminar.');
      router.refresh();
    });
  }

  return (
    <section className="card mb-4 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Catálogo de incumplimientos</h2>
          <p className="mt-0.5 text-xs text-muted">
            Cada tipo define su propio escalamiento. Los botones del paso 2 salen de aquí, en este orden.
          </p>
        </div>
        <button type="button" onClick={() => setCreando(true)} className="btn-primary">
          <Plus size={16} /> Nuevo tipo
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {tipos.length === 0 ? (
        <p className="mt-4 rounded-xl bg-canvas p-6 text-center text-sm text-muted">
          Todavía no hay tipos configurados. Sin ellos, la pantalla de emisión no tiene botones que mostrar.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Incumplimiento</th>
                <th className="py-2 pr-3">Reglamento</th>
                <th className="py-2 pr-3">Escalamiento</th>
                <th className="py-2 pr-3">Multa</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="py-3 pr-3">
                    <span className="block font-semibold text-ink">{t.name}</span>
                    {t.description && <span className="block text-xs text-muted">{t.description}</span>}
                  </td>
                  <td className="py-3 pr-3 text-muted">{t.regulationArticle ?? '—'}</td>
                  <td className="py-3 pr-3 text-muted">
                    {t.immediateFine ? (
                      <span className="flex items-center gap-1 font-semibold text-danger">
                        <Gavel size={13} /> Multa inmediata
                      </span>
                    ) : (
                      <>
                        {t.warningsRequired} advertencia{t.warningsRequired === 1 ? '' : 's'} · cada {t.daysBetween} días
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-muted">
                    {t.fineAmount > 0 ? t.fineAmount.toLocaleString('es-CR') : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <StatusChip variant={t.isActive ? 'ok' : 'neutral'}>{t.isActive ? 'Activo' : 'Inactivo'}</StatusChip>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => alternar(t)}
                        title={t.isActive ? 'Desactivar' : 'Activar'}
                        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                      >
                        {t.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(t)}
                        title="Editar"
                        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminar(t)}
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
        <TypeForm
          condominiumId={condominiumId}
          tipo={editando}
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

function TypeForm({
  condominiumId,
  tipo,
  onClose,
}: {
  condominiumId: string;
  tipo: Tipo | null;
  onClose: () => void;
}) {
  const [state, formAction] = useFormState(saveViolationTypeAction, VACIO);
  const [inmediata, setInmediata] = useState(tipo?.immediateFine ?? false);

  // Cerrar en un efecto y no durante el render: llamar a onClose() en
  // el cuerpo del componente actualiza el estado del padre mientras el
  // hijo se está pintando, y React lo rechaza.
  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  return (
    <Modal title={tipo ? `Editar ${tipo.name}` : 'Nuevo tipo de incumplimiento'} onClose={onClose}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="typeId" value={tipo?.id ?? ''} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre" error={state.errors?.name?.[0]}>
            <input name="name" defaultValue={tipo?.name} className="field-input w-full" placeholder="Ruido" />
          </Campo>
          <Campo label="Artículo del reglamento">
            <input
              name="regulationArticle"
              defaultValue={tipo?.regulationArticle ?? ''}
              className="field-input w-full"
              placeholder="Artículo 12, inciso b"
            />
          </Campo>
        </div>

        <Campo label="Descripción">
          <input
            name="description"
            defaultValue={tipo?.description ?? ''}
            className="field-input w-full"
            placeholder="Ruido que altera la tranquilidad después de las 10 p. m."
          />
        </Campo>

        {/* --- Plazos de reincidencia y aplicación de multa --- */}
        <div className="rounded-xl bg-canvas p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Plazos de reincidencia y aplicación de multa
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              name="immediateFine"
              defaultChecked={tipo?.immediateFine}
              onChange={(e) => setInmediata(e.target.checked)}
            />
            Aplicar multa inmediata (sin advertencias previas)
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo label="Advertencias antes de la multa">
              <input
                name="warningsRequired"
                type="number"
                min={0}
                max={10}
                defaultValue={tipo?.warningsRequired ?? 2}
                disabled={inmediata}
                className="field-input w-full disabled:opacity-50"
              />
            </Campo>
            <Campo label="Días entre una acción y la siguiente">
              <input
                name="daysBetween"
                type="number"
                min={0}
                max={365}
                defaultValue={tipo?.daysBetween ?? 15}
                disabled={inmediata}
                className="field-input w-full disabled:opacity-50"
              />
            </Campo>
          </div>
          <p className="mt-2 text-xs text-muted">
            {inmediata
              ? 'Con multa inmediata, la primera vez que se reporte este incumplimiento se emite directamente la resolución de multa y se genera la cuenta por cobrar.'
              : 'Se emiten las advertencias configuradas y, al agotarlas, corresponde la multa.'}
          </p>
        </div>

        {/* --- Monto de la multa --- */}
        <div className="rounded-xl bg-canvas p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
            Monto de la multa para este incumplimiento
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Monto">
              <input
                name="fineAmount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={tipo?.fineAmount ?? 0}
                className="field-input w-full"
              />
            </Campo>
            <p className="self-end pb-2 text-xs text-muted">
              Al emitir la multa, este monto se carga al estado de cuenta de la filial como una
              cuenta por cobrar.
            </p>
          </div>
        </div>

        {/* --- Los tres formatos --- */}
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Formato de los tres documentos (opcional)
          </summary>
          <p className="mt-2 text-xs text-muted">
            Si se dejan vacíos se usa el texto estándar. Variables disponibles:{' '}
            {TEMPLATE_VARS.map((v) => `{${v.key}}`).join(' · ')}
          </p>
          <Campo label="1. Primera notificación">
            <textarea
              name="warningTemplate"
              rows={5}
              defaultValue={tipo?.warningTemplate ?? ''}
              className="field-input w-full font-mono text-xs"
            />
          </Campo>
          <Campo label="2. Segunda notificación en adelante">
            <textarea
              name="secondWarningTemplate"
              rows={6}
              defaultValue={tipo?.secondWarningTemplate ?? ''}
              className="field-input w-full font-mono text-xs"
            />
          </Campo>
          <p className="-mt-2 mb-3 text-xs text-muted">
            Usá <code>{'{fechaPrimera}'}</code> y <code>{'{horaPrimera}'}</code> para citar cuándo se
            envió la primera, y <code>{'{consecuencia}'}</code> para advertir qué pasa si reincide —
            el texto sale del escalamiento configurado arriba.
          </p>
          <Campo label="3. Resolución de multa">
            <textarea
              name="fineTemplate"
              rows={5}
              defaultValue={tipo?.fineTemplate ?? ''}
              className="field-input w-full font-mono text-xs"
            />
          </Campo>
        </details>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Orden en la pantalla">
            <input name="sortOrder" type="number" min={0} defaultValue={tipo?.sortOrder ?? 0} className="field-input w-full" />
          </Campo>
          <label className="flex items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" name="isActive" defaultChecked={tipo?.isActive ?? true} value="on" />
            Activo
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
      {pending ? 'Guardando…' : 'Guardar'}
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
