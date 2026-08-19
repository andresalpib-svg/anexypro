'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Boxes, Plus, PlayCircle, Archive, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import {
  createAssetAction,
  updateAssetAction,
  runDepreciationAction,
  runCondoDepreciationAction,
  disposeAssetAction,
  type ActionState,
} from './actions';
import { CategorySelect, type AssetCategoryOption } from '../mantenimiento/category-select';
import { enTransicion } from '@/lib/accion-segura';
import { hoyISO as hoy } from '@/lib/fecha-local';

export type SupplierOpt = { id: string; name: string };

export type AssetRow = {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  description: string | null;
  location: string | null;
  purchaseDate: string | null;
  supplierId: string | null;
  supplierName: string | null;
  acquisitionValue: number | null;
  residualValue: number;
  usefulLifeMonths: number | null;
  depreciationMethod: string | null;
  depreciationStartDate: string | null;
  status: string;
  photoUrl: string | null;
  bookValue: number | null;
  accumulatedDepreciation: number;
  disposed: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  baja: 'De baja',
};

const STATUS_VARIANT: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  operativo: 'ok',
  en_mantenimiento: 'warn',
  fuera_servicio: 'danger',
  baja: 'neutral',
};

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

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
    <div className="space-y-0.5">
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

function AssetFormModal({
  condominiumId,
  asset,
  categories,
  suppliers,
  onDone,
}: {
  condominiumId: string;
  asset: AssetRow | null;
  categories: AssetCategoryOption[];
  suppliers: SupplierOpt[];
  onDone: () => void;
}) {
  const action = asset ? updateAssetAction : createAssetAction;
  const [state, formAction] = useFormState<ActionState, FormData>(action, {});
  useEffect(() => {
    if (state.success) {
      toast.success(asset ? 'Activo actualizado.' : 'Activo registrado.');
      onDone();
    }
  }, [state.success, asset, onDone]);

  return (
    <Modal title={asset ? `Editar activo — ${asset.code}` : 'Nuevo activo'} onClose={onDone} width="max-w-3xl">
      <form action={formAction} className="space-y-3 p-5">
        {asset ? <input type="hidden" name="assetId" value={asset.id} /> : <input type="hidden" name="condominiumId" value={condominiumId} />}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Código {!asset && '(opcional — se genera solo)'}</label>
            <input name="code" defaultValue={asset?.code ?? ''} placeholder="ACT-0001" className="field-input w-32" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="field-label">Nombre</label>
            <input name="name" defaultValue={asset?.name ?? ''} placeholder="Elevador Torre A" className="field-input" />
          </div>
          <div className="min-w-40">
            <label className="field-label">Categoría</label>
            <CategorySelect condominiumId={condominiumId} categories={categories} defaultValue={asset?.categoryId ?? undefined} />
          </div>
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <input name="description" defaultValue={asset?.description ?? ''} className="field-input" />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-40 flex-1">
            <label className="field-label">Ubicación</label>
            <input name="location" defaultValue={asset?.location ?? ''} className="field-input" />
          </div>
          <div>
            <label className="field-label">Fecha de adquisición</label>
            <input name="purchaseDate" type="date" defaultValue={asset?.purchaseDate?.slice(0, 10) ?? ''} className="field-input w-40" />
          </div>
          <div className="min-w-48 flex-1">
            <label className="field-label">Proveedor</label>
            <select name="supplierId" defaultValue={asset?.supplierId ?? ''} className="field-input">
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-2 rounded-lg bg-royal-soft px-3 py-2 text-xs leading-relaxed text-ink">
          Los siguientes 5 campos son los que permiten depreciar el activo — dejalos vacíos si no aplica (ej. un
          artículo pequeño registrado solo por inventario).
        </p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="field-label">Valor de adquisición</label>
            <input name="acquisitionValue" type="number" step="0.01" min="0" defaultValue={asset?.acquisitionValue ?? ''} className="field-input w-36" />
          </div>
          <div>
            <label className="field-label">Valor residual</label>
            <input name="residualValue" type="number" step="0.01" min="0" defaultValue={asset?.residualValue ?? 0} className="field-input w-32" />
          </div>
          <div>
            <label className="field-label">Vida útil (meses)</label>
            <input name="usefulLifeMonths" type="number" min="1" defaultValue={asset?.usefulLifeMonths ?? ''} className="field-input w-32" />
          </div>
          <div>
            <label className="field-label">Método</label>
            <select name="depreciationMethod" defaultValue={asset?.depreciationMethod ?? ''} className="field-input w-32">
              <option value="">Sin depreciar</option>
              <option value="lineal">Lineal</option>
            </select>
          </div>
          <div>
            <label className="field-label">Inicio de depreciación</label>
            <input
              name="depreciationStartDate"
              type="date"
              defaultValue={asset?.depreciationStartDate?.slice(0, 10) ?? ''}
              className="field-input w-40"
            />
          </div>
        </div>
        <div>
          <label className="field-label">Fotografía {asset?.photoUrl && '(reemplaza la actual)'}</label>
          <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input text-xs" />
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label={asset ? 'Guardar cambios' : 'Registrar activo'} busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DisposeModal({ condominiumId, asset, onDone }: { condominiumId: string; asset: AssetRow; onDone: () => void }) {
  const [state, formAction] = useFormState<ActionState, FormData>(disposeAssetAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Activo dado de baja. Queda en el historial, nunca se borra.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title={`Dar de baja — ${asset.code} · ${asset.name}`} onClose={onDone} width="max-w-lg">
      <form action={formAction} className="space-y-3 p-5">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <input type="hidden" name="assetId" value={asset.id} />
        <p className="rounded-lg bg-warn-bg/40 px-3 py-2 text-xs leading-relaxed text-ink">
          El activo NO se elimina — sigue en el historial con estado "De baja" y el valor en libros que tenía en
          ese momento ({asset.bookValue !== null ? asset.bookValue.toLocaleString('es-CR') : '—'}).
        </p>
        <div>
          <label className="field-label">Fecha</label>
          <input name="date" type="date" defaultValue={hoy()} className="field-input w-40" />
        </div>
        <div>
          <label className="field-label">Motivo</label>
          <textarea name="reason" rows={2} className="field-input" placeholder="Ej: vendido, obsoleto, destruido por…" />
        </div>
        <div>
          <label className="field-label">Documento de respaldo (opcional)</label>
          <input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png" className="field-input text-xs" />
        </div>
        <Errors state={state} />
        <div className="flex gap-2 pt-1">
          <Submit label="Dar de baja" busy="Guardando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssetDetailModal({
  condominiumId,
  asset,
  onDone,
  onDispose,
}: {
  condominiumId: string;
  asset: AssetRow;
  onDone: () => void;
  onDispose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const canDepreciate = asset.status !== 'baja' && !asset.disposed;
  const hasDepreciationData =
    asset.acquisitionValue !== null && asset.usefulLifeMonths !== null && asset.depreciationMethod && asset.depreciationStartDate;

  const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CR'));
  const baseDepreciable = asset.acquisitionValue !== null ? asset.acquisitionValue - asset.residualValue : null;

  return (
    <Modal title={`${asset.code} · ${asset.name}`} subtitle={asset.categoryName ?? 'Sin categoría'} onClose={onDone} width="max-w-2xl">
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[.68rem] uppercase tracking-wide text-muted">Estado</p>
            <StatusChip variant={STATUS_VARIANT[asset.status] ?? 'neutral'}>{STATUS_LABEL[asset.status] ?? asset.status}</StatusChip>
          </div>
          <div>
            <p className="text-[.68rem] uppercase tracking-wide text-muted">Ubicación</p>
            <p className="text-ink">{asset.location ?? '—'}</p>
          </div>
          <div>
            <p className="text-[.68rem] uppercase tracking-wide text-muted">Proveedor</p>
            <p className="text-ink">{asset.supplierName ?? '—'}</p>
          </div>
          <div>
            <p className="text-[.68rem] uppercase tracking-wide text-muted">Fecha de adquisición</p>
            <p className="text-ink">{fecha(asset.purchaseDate)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Depreciación</p>
          {!hasDepreciationData ? (
            <p className="text-sm text-muted">Este activo no tiene datos de depreciación cargados (valor de adquisición, vida útil, método y fecha de inicio).</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[.68rem] uppercase tracking-wide text-muted">Base depreciable</p>
                  <p className="font-sans text-sm font-bold text-ink">{fmt(baseDepreciable)}</p>
                </div>
                <div>
                  <p className="text-[.68rem] uppercase tracking-wide text-muted">Acumulada</p>
                  <p className="font-sans text-sm font-bold text-warn">{fmt(asset.accumulatedDepreciation)}</p>
                </div>
                <div>
                  <p className="text-[.68rem] uppercase tracking-wide text-muted">Valor en libros</p>
                  <p className="font-sans text-sm font-bold text-ink">{fmt(asset.bookValue)}</p>
                </div>
                <div>
                  <p className="text-[.68rem] uppercase tracking-wide text-muted">Valor residual</p>
                  <p className="font-sans text-sm font-bold text-muted">{fmt(asset.residualValue)}</p>
                </div>
              </div>
              {canDepreciate && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    enTransicion(startTransition, async () => {
                      const r = await runDepreciationAction(asset.id, condominiumId);
                      if (r.ok) toast.success('Depreciación de este período registrada.');
                      else toast.error(r.error);
                    })
                  }
                  className="btn-ghost mt-3 py-1.5 text-xs"
                >
                  <PlayCircle size={13} /> Depreciar este período
                </button>
              )}
            </>
          )}
        </div>

        {asset.disposed && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            <ShieldOff size={13} className="flex-none" /> Este activo está de baja — no admite más movimientos.
          </p>
        )}
        {canDepreciate && (
          <button type="button" onClick={onDispose} className="btn-ghost mt-3 py-1.5 text-xs text-danger">
            <Archive size={13} /> Dar de baja
          </button>
        )}
      </div>
    </Modal>
  );
}

export function AssetsBoard({
  condominiumId,
  canManage,
  assets,
  categories,
  suppliers,
}: {
  condominiumId: string;
  canManage: boolean;
  assets: AssetRow[];
  categories: AssetCategoryOption[];
  suppliers: SupplierOpt[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetRow | undefined>();
  const [detailAsset, setDetailAsset] = useState<AssetRow | null>(null);
  const [disposeAsset, setDisposeAsset] = useState<AssetRow | null>(null);
  const [pending, startTransition] = useTransition();

  const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CR'));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Activos ({assets.length})</p>
        {canManage && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                enTransicion(startTransition, async () => {
                  const r = await runCondoDepreciationAction(condominiumId);
                  if (r.ok) toast.success(r.summary ?? 'Depreciación corrida.');
                  else toast.error(r.error);
                })
              }
              className="btn-ghost py-2 text-xs"
            >
              <PlayCircle size={14} /> Depreciar todos (este período)
            </button>
            <button
              type="button"
              onClick={() => {
                setEditAsset(undefined);
                setShowForm(true);
              }}
              className="btn-primary py-2 text-xs"
            >
              <Plus size={14} /> Nuevo activo
            </button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Ubicación</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Adquisición</th>
                <th className="px-4 py-3 text-right">Valor en libros</th>
                <th className="px-4 py-3">Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    <Boxes className="mx-auto mb-2" size={22} />
                    Sin activos registrados todavía.
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
                    onClick={() => setDetailAsset(a)}
                  >
                    <td className="px-4 py-3 font-medium text-royal">{a.code}</td>
                    <td className="px-4 py-3 text-ink">{a.name}</td>
                    <td className="px-4 py-3 text-muted">{a.categoryName ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{a.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusChip variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{STATUS_LABEL[a.status] ?? a.status}</StatusChip>
                    </td>
                    <td className="px-4 py-3 text-right text-ink">{fmt(a.acquisitionValue)}</td>
                    <td className="px-4 py-3 text-right font-sans font-bold text-ink">{fmt(a.bookValue)}</td>
                    <td className="px-4 py-3 text-muted">{a.supplierName ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <AssetFormModal
          condominiumId={condominiumId}
          asset={editAsset ?? null}
          categories={categories}
          suppliers={suppliers}
          onDone={() => {
            setShowForm(false);
            setEditAsset(undefined);
          }}
        />
      )}
      {detailAsset && (
        <AssetDetailModal
          condominiumId={condominiumId}
          asset={detailAsset}
          onDone={() => setDetailAsset(null)}
          onDispose={() => {
            setDisposeAsset(detailAsset);
            setDetailAsset(null);
          }}
        />
      )}
      {disposeAsset && (
        <DisposeModal condominiumId={condominiumId} asset={disposeAsset} onDone={() => setDisposeAsset(null)} />
      )}
    </div>
  );
}
