'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Plus, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { enTransicion } from '@/lib/accion-segura';
import { saveAssetCategoryAction, toggleAssetCategoryAction, deleteAssetCategoryAction, type ActionState } from './actions';
import type { AssetCategoryOption } from './category-select';

const VACIO: ActionState = {};

/**
 * "Editar más opciones" del selector de Categoría. Mismo patrón que el
 * catálogo de incumplimientos: agregar, renombrar, desactivar o —si no
 * tiene activos— borrar. Una categoría con activos no se deja borrar,
 * para no dejarlos sin categoría.
 */
export function AssetCategoryManager({
  condominiumId,
  categories,
  onClose,
}: {
  condominiumId: string;
  categories: AssetCategoryOption[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const [state, formAction] = useFormState(saveAssetCategoryAction, VACIO);
  const router = useRouter();

  function alternar(c: AssetCategoryOption) {
    enTransicion(start, async () => {
      const r = await toggleAssetCategoryAction(c.id, !c.isActive);
      if (!r.ok) setError(r.error ?? 'No se pudo actualizar.');
      router.refresh();
    });
  }

  function eliminar(c: AssetCategoryOption) {
    enTransicion(start, async () => {
      const r = await deleteAssetCategoryAction(c.id);
      if (!r.ok) setError(r.error ?? 'No se pudo eliminar.');
      router.refresh();
    });
  }

  return (
    <Modal title="Categorías de activos" subtitle="Se usan al crear o editar un activo, en este condominio" onClose={onClose} width="max-w-lg">
      <div className="p-5">
        {error && <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

        {categories.length === 0 ? (
          <p className="mb-4 rounded-xl bg-canvas p-4 text-center text-sm text-muted">Todavía no hay categorías.</p>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 text-ink">{c.name}</span>
                <StatusChip variant={c.isActive ? 'ok' : 'neutral'}>{c.isActive ? 'Activa' : 'Inactiva'}</StatusChip>
                <button
                  type="button"
                  onClick={() => alternar(c)}
                  title={c.isActive ? 'Desactivar' : 'Activar'}
                  className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                >
                  {c.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => eliminar(c)}
                  title="Eliminar"
                  className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form action={formAction} className="flex items-end gap-2 border-t border-line pt-4">
          <input type="hidden" name="condominiumId" value={condominiumId} />
          <div className="flex-1">
            <label className="field-label">Nueva categoría</label>
            <input name="name" placeholder="Cámaras de seguridad" className="field-input w-full" />
            {state.errors?.name && <p className="mt-1 text-xs text-danger">{state.errors.name[0]}</p>}
          </div>
          <Agregar />
        </form>
        {state.formError && <p className="mt-2 text-xs text-danger">{state.formError}</p>}
      </div>
    </Modal>
  );
}

function Agregar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      <Plus size={14} /> {pending ? 'Agregando…' : 'Agregar'}
    </button>
  );
}
