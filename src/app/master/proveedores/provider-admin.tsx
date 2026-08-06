'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Pencil, Trash2, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { SERVICE_CATEGORIES, categoryLabel } from '@/lib/services/service-providers';
import { saveProviderAction, toggleVisibilityAction, deleteProviderAction, type ActionState } from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type AdminProvider = {
  id: string;
  category: string;
  name: string;
  description: string | null;
  accessories: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  visible: boolean;
};

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar proveedor'}
    </button>
  );
}

function ProviderForm({ provider, onDone }: { provider?: AdminProvider; onDone: () => void }) {
  const [state, formAction] = useFormState<ActionState, FormData>(saveProviderAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      toast.success(provider ? 'Proveedor actualizado.' : 'Proveedor agregado.');
      onDone();
    }
  }, [state.success, provider, onDone]);

  return (
    <form ref={ref} action={formAction} className="rounded-xl bg-canvas p-4">
      {provider && <input type="hidden" name="providerId" value={provider.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Tipo de proveedor</label>
          <select name="category" defaultValue={provider?.category ?? 'materiales'} className="field-input">
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="field-label">Nombre de la empresa</label>
          <input name="name" defaultValue={provider?.name ?? ''} className="field-input" />
        </div>
        <div>
          <label className="field-label">Teléfono</label>
          <input name="phone" defaultValue={provider?.phone ?? ''} placeholder="2222-3333" className="field-input w-32" />
        </div>
        <div>
          <label className="field-label">WhatsApp (opcional)</label>
          <input name="whatsapp" defaultValue={provider?.whatsapp ?? ''} placeholder="50688887777" className="field-input w-36" />
        </div>
        <div>
          <label className="field-label">Logo</label>
          <input name="logo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-48 text-xs" />
        </div>
        <div className="w-full">
          <label className="field-label">Descripción</label>
          <input
            name="description"
            defaultValue={provider?.description ?? ''}
            placeholder="Qué vende o qué servicio brinda"
            className="field-input"
          />
        </div>
        <div className="w-full">
          <label className="field-label">Accesorios y productos que vende</label>
          <input
            name="accessories"
            defaultValue={provider?.accessories ?? ''}
            placeholder="Cemento, varilla, block, tornillería, pintura… (separados por coma)"
            className="field-input"
          />
          <p className="mt-1 text-[.7rem] text-muted">
            Alimenta la búsqueda por accesorio del residente. Se puede editar en cualquier momento.
          </p>
        </div>
        <div>
          <label className="field-label">Correo (opcional)</label>
          <input name="email" type="email" defaultValue={provider?.email ?? ''} className="field-input w-52" />
        </div>
        <div>
          <label className="field-label">Sitio web (opcional)</label>
          <input name="website" defaultValue={provider?.website ?? ''} className="field-input w-52" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-ink">
          <input type="checkbox" name="visible" defaultChecked={provider?.visible ?? true} /> Visible para residentes
        </label>
        <SaveButton editing={Boolean(provider)} />
        <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
          Cancelar
        </button>
      </div>
      {state.formError && <p className="mt-2 text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((msgs, i) => (
          <p key={i} className="mt-1 text-xs font-medium text-danger">
            {msgs?.[0]}
          </p>
        ))}
    </form>
  );
}

export function ProviderAdmin({ providers }: { providers: AdminProvider[] }) {
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [pending, startTransition] = useTransition();

  const q = query.trim().toLowerCase();
  const visible = providers
    .filter((p) => (category ? p.category === category : true))
    .filter((p) => (q ? `${p.name} ${p.description ?? ''} ${p.accessories ?? ''} ${p.phone}`.toLowerCase().includes(q) : true));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input w-auto">
          <option value="">Todos los tipos</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar proveedor…"
            className="field-input pl-9"
          />
        </div>
        <button type="button" onClick={() => setShowNew((v) => !v)} className="btn-primary">
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      {showNew && (
        <div className="mt-4">
          <ProviderForm onDone={() => setShowNew(false)} />
        </div>
      )}

      <div className="card mt-4 divide-y divide-line">
        {visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">Sin proveedores en esta vista.</p>
        ) : (
          visible.map((p) =>
            editing === p.id ? (
              <div key={p.id} className="p-4">
                <ProviderForm provider={p} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <div key={p.id} className="flex items-center gap-3 p-4">
                {p.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={p.logoUrl} alt={p.name} className="h-11 w-11 flex-none rounded-lg border border-line object-contain p-0.5" />
                ) : (
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-royal-soft text-sm font-bold text-royal">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${p.visible ? 'text-ink' : 'text-muted line-through'}`}>
                    {p.name}
                    <span className="ml-2 text-xs font-normal text-muted">{categoryLabel(p.category)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {p.phone}
                    {p.description && ` · ${p.description}`}
                  </p>
                  {p.accessories && <p className="truncate text-[.7rem] text-royal">{p.accessories}</p>}
                </div>

                <button
                  type="button"
                  disabled={pending}
                  title={p.visible ? 'Ocultar a los residentes' : 'Mostrar a los residentes'}
                  onClick={() =>
                    enTransicion(startTransition, async () => {
                      const r = await toggleVisibilityAction(p.id, !p.visible);
                      if (r.ok) toast.success(p.visible ? 'Proveedor oculto.' : 'Proveedor visible.');
                      else toast.error(r.error);
                    })
                  }
                  className={`flex-none transition ${p.visible ? 'text-ok hover:text-muted' : 'text-muted hover:text-ok'}`}
                >
                  {p.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(p.id)}
                  title="Modificar"
                  className="flex-none text-muted transition hover:text-royal"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  title="Eliminar"
                  onClick={() => {
                    if (!window.confirm(`¿Eliminar a "${p.name}" del directorio? Esta acción no se puede deshacer.`)) return;
                    enTransicion(startTransition, async () => {
                      const r = await deleteProviderAction(p.id);
                      if (r.ok) toast.success('Proveedor eliminado.');
                      else toast.error(r.error);
                    });
                  }}
                  className="flex-none text-muted transition hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
