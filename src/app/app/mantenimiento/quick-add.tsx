'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createAssetAction, createProviderAction, type ActionState } from './actions';
import { CategorySelect, type AssetCategoryOption } from './category-select';

export function QuickAddAsset({ condominiumId, categories }: { condominiumId: string; categories: AssetCategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createAssetAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs"><Plus size={13} /> Activo</button>;
  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Nombre</label>
        <input name="name" placeholder="Elevador Torre A" className="field-input w-40" />
      </div>
      <div>
        <label className="field-label">Categoría</label>
        <CategorySelect condominiumId={condominiumId} categories={categories} defaultValue={categories.find((c) => c.name === 'Otro')?.id} />
        {state.errors?.categoryId && <p className="mt-1 text-xs text-danger">{state.errors.categoryId[0]}</p>}
      </div>
      <div>
        <label className="field-label">Descripción</label>
        <input name="description" placeholder="Marca, modelo, detalles…" className="field-input w-56" />
      </div>
      <div>
        <label className="field-label">Costo aproximado</label>
        <input name="approxCost" type="number" step="0.01" className="field-input w-28" />
      </div>
      <div>
        <label className="field-label">Fotografía</label>
        <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-52 text-xs" />
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">Cancelar</button>
    </form>
  );
}

export function QuickAddProvider({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createProviderAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs"><Plus size={13} /> Proveedor</button>;
  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Nombre</label>
        <input name="name" placeholder="Ascensores CR S.A." className="field-input w-40" />
      </div>
      <div>
        <label className="field-label">Servicio</label>
        <input name="serviceType" placeholder="Elevadores" className="field-input w-32" />
      </div>
      <div>
        <label className="field-label">Teléfono</label>
        <input name="phone" className="field-input w-32" />
      </div>
      <div>
        <label className="field-label">Correo</label>
        <input name="email" type="email" className="field-input w-44" />
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">Cancelar</button>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">{pending ? 'Guardando…' : 'Guardar'}</button>;
}
