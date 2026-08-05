'use client';

import { useState, useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createPropertyAction, type CreatePropertyState } from './actions';

const initialState: CreatePropertyState = {};

export function NewPropertyForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createPropertyAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
        <Plus size={16} /> Nueva unidad
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label" htmlFor="code">
          Código
        </label>
        <input id="code" name="code" placeholder="A-101" className="field-input w-32" />
        {state.errors?.code && <p className="mt-1 text-xs text-danger">{state.errors.code[0]}</p>}
      </div>
      <div>
        <label className="field-label" htmlFor="propertyType">
          Tipo
        </label>
        <select id="propertyType" name="propertyType" defaultValue="apartamento" className="field-input">
          <option value="casa">Casa</option>
          <option value="apartamento">Apartamento</option>
          <option value="local">Local</option>
          <option value="lote">Lote</option>
          <option value="parqueo">Parqueo</option>
          <option value="bodega">Bodega</option>
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="floor">
          Piso
        </label>
        <input id="floor" name="floor" type="number" className="field-input w-20" />
      </div>
      <div>
        <label className="field-label" htmlFor="parkingSpaces">
          Parqueos
        </label>
        <input id="parkingSpaces" name="parkingSpaces" type="number" defaultValue="0" className="field-input w-20" />
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancelar
      </button>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
  );
}
