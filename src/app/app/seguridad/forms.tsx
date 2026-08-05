'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createIncidentAction, receivePackageAction, type ActionState } from './actions';

export function NewIncidentForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createIncidentAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} /> Reportar incidente</button>;
  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Título</label>
        <input name="title" className="field-input w-48" />
        {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
      </div>
      <div>
        <label className="field-label">Categoría</label>
        <select name="category" defaultValue="seguridad" className="field-input">
          <option value="seguridad">Seguridad</option>
          <option value="mantenimiento">Mantenimiento</option>
          <option value="convivencia">Convivencia</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div>
        <label className="field-label">Descripción</label>
        <input name="description" className="field-input w-56" />
      </div>
      <SubmitButton label="Reportar" />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
    </form>
  );
}

export function NewPackageForm({ condominiumId, properties }: { condominiumId: string; properties: { id: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(receivePackageAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} /> Registrar paquete</button>;
  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Unidad</label>
        <select name="propertyId" className="field-input">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Transportista</label>
        <input name="courier" className="field-input w-32" />
      </div>
      <div>
        <label className="field-label">Descripción</label>
        <input name="description" className="field-input w-40" />
      </div>
      <SubmitButton label="Registrar" />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="btn-primary">{pending ? '…' : label}</button>;
}
