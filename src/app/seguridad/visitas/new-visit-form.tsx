'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createVisitAction, type ActionState } from './actions';

export function NewVisitForm({ condominiumId, properties }: { condominiumId: string; properties: { id: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('rapida');
  const [state, formAction] = useFormState<ActionState, FormData>(createVisitAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Plus size={16} /> Visitante sin autorización previa
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card space-y-2 p-4">
      <p className="mb-2 text-xs text-muted">
        Para un visitante que llega sin que el residente haya generado un código previamente. Queda
        registrada como creada por vos, con seguimiento en Auditoría.
      </p>
      <div className="flex flex-wrap items-end gap-3">
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
          <label className="field-label">Tipo</label>
          <select name="visitType" value={type} onChange={(e) => setType(e.target.value)} className="field-input">
            <option value="rapida">Rápida</option>
            <option value="entrega">Entrega</option>
          </select>
        </div>
        <div>
          <label className="field-label">{type === 'entrega' ? 'Transportista' : 'Nombre del visitante'}</label>
          <input name="visitorName" className="field-input w-40" />
        </div>
        <div>
          <label className="field-label">Fecha</label>
          <input name="validDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field-input" />
        </div>
        {type !== 'entrega' && (
          <div>
            <label className="field-label">Placa (opcional)</label>
            <input name="vehiclePlate" className="field-input w-28" />
          </div>
        )}
        <SubmitButton />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancelar
        </button>
      </div>
      {state.errors?.visitorName && <p className="text-xs text-danger">{state.errors.visitorName[0]}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Generando…' : 'Generar código'}
    </button>
  );
}
