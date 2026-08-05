'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  updateAssetAction,
  deleteAssetAction,
  updateProviderAction,
  deleteProviderAction,
  type ActionState,
} from './actions';

const CATEGORY_LABEL: Record<string, string> = {
  elevador: 'Elevador',
  bomba: 'Bomba',
  generador: 'Generador',
  piscina: 'Piscina',
  porton: 'Portón',
  techo: 'Techo',
  otro: 'Otro',
};

export type AssetItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  approxCost: string | null;
  location: string | null;
  photoUrl: string | null;
};

export type ProviderItem = {
  id: string;
  name: string;
  serviceType: string | null;
  phone: string | null;
  email: string | null;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
}

function DeleteButton({ onDelete, label }: { onDelete: () => Promise<{ ok: boolean; error?: string }>; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
        startTransition(async () => {
          const result = await onDelete();
          if (result.ok) toast.success('Eliminado.');
          else toast.error(result.error);
        });
      }}
      className="text-muted transition hover:text-danger disabled:opacity-50"
      title="Eliminar"
    >
      <Trash2 size={14} />
    </button>
  );
}

function AssetRow({ asset }: { asset: AssetItem }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(updateAssetAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 py-2">
        {asset.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.photoUrl} alt={asset.name} className="h-10 w-10 flex-none rounded-lg object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-canvas text-xs font-bold text-muted">
            {asset.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {asset.name} <span className="font-normal text-muted">· {CATEGORY_LABEL[asset.category] ?? asset.category}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {asset.description || 'Sin descripción'}
            {asset.approxCost !== null && ` · Costo aprox. ${Number(asset.approxCost).toLocaleString('es-CR')}`}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-muted transition hover:text-royal" title="Editar">
          <Pencil size={14} />
        </button>
        <DeleteButton label={`el activo "${asset.name}"`} onDelete={() => deleteAssetAction(asset.id)} />
      </li>
    );
  }

  return (
    <li className="py-2">
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
        <input type="hidden" name="assetId" value={asset.id} />
        <div>
          <label className="field-label">Nombre</label>
          <input name="name" defaultValue={asset.name} className="field-input w-40" />
        </div>
        <div>
          <label className="field-label">Categoría</label>
          <select name="category" defaultValue={asset.category} className="field-input">
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Descripción</label>
          <input name="description" defaultValue={asset.description ?? ''} className="field-input w-56" />
        </div>
        <div>
          <label className="field-label">Costo aproximado</label>
          <input name="approxCost" type="number" step="0.01" defaultValue={asset.approxCost ?? ''} className="field-input w-28" />
        </div>
        <div>
          <label className="field-label">Ubicación</label>
          <input name="location" defaultValue={asset.location ?? ''} className="field-input w-32" />
        </div>
        <div>
          <label className="field-label">Fotografía {asset.photoUrl && '(reemplaza la actual)'}</label>
          <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-52 text-xs" />
        </div>
        <SaveButton />
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost py-1.5 text-xs">
          Cancelar
        </button>
        {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
        {state.errors &&
          Object.entries(state.errors).map(([field, msgs]) => (
            <p key={field} className="w-full text-xs text-danger">
              {msgs?.[0]}
            </p>
          ))}
      </form>
    </li>
  );
}

export function AssetList({ assets }: { assets: AssetItem[] }) {
  if (assets.length === 0) return <p className="mt-2 text-sm text-muted">Sin activos registrados.</p>;
  return (
    <ul className="mt-2 divide-y divide-line text-sm">
      {assets.map((a) => (
        <AssetRow key={a.id} asset={a} />
      ))}
    </ul>
  );
}

function ProviderRow({ provider }: { provider: ProviderItem }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(updateProviderAction, {});

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {provider.name} <span className="font-normal text-muted">· {provider.serviceType || 'Servicio general'}</span>
          </p>
          <p className="truncate text-xs text-muted">
            {[provider.phone, provider.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-muted transition hover:text-royal" title="Editar">
          <Pencil size={14} />
        </button>
        <DeleteButton label={`el proveedor "${provider.name}"`} onDelete={() => deleteProviderAction(provider.id)} />
      </li>
    );
  }

  return (
    <li className="py-2">
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
        <input type="hidden" name="providerId" value={provider.id} />
        <div>
          <label className="field-label">Nombre</label>
          <input name="name" defaultValue={provider.name} className="field-input w-40" />
        </div>
        <div>
          <label className="field-label">Servicio</label>
          <input name="serviceType" defaultValue={provider.serviceType ?? ''} className="field-input w-32" />
        </div>
        <div>
          <label className="field-label">Teléfono</label>
          <input name="phone" defaultValue={provider.phone ?? ''} className="field-input w-32" />
        </div>
        <div>
          <label className="field-label">Correo</label>
          <input name="email" type="email" defaultValue={provider.email ?? ''} className="field-input w-44" />
        </div>
        <SaveButton />
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost py-1.5 text-xs">
          Cancelar
        </button>
        {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
        {state.errors &&
          Object.entries(state.errors).map(([field, msgs]) => (
            <p key={field} className="w-full text-xs text-danger">
              {msgs?.[0]}
            </p>
          ))}
      </form>
    </li>
  );
}

export function ProviderList({ providers }: { providers: ProviderItem[] }) {
  if (providers.length === 0) return <p className="mt-2 text-sm text-muted">Sin proveedores registrados.</p>;
  return (
    <ul className="mt-2 divide-y divide-line text-sm">
      {providers.map((p) => (
        <ProviderRow key={p.id} provider={p} />
      ))}
    </ul>
  );
}
