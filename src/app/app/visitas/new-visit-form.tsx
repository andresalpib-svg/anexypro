'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createVisitAction, type ActionState } from './actions';

export function NewVisitForm({ condominiumId, properties }: { condominiumId: string; properties: { id: string; code: string }[] }) {
  const [type, setType] = useState('rapida');
  const [state, formAction] = useFormState<ActionState, FormData>(createVisitAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <p className="flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Plus size={13} /> Autorizar visita
      </p>
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
          <option value="recurrente">Recurrente</option>
        </select>
      </div>
      <div>
        <label className="field-label">{type === 'entrega' ? 'Transportista' : 'Nombre del visitante'}</label>
        <input name="visitorName" className="field-input w-40" />
      </div>
      {type !== 'recurrente' ? (
        <div>
          <label className="field-label">Fecha</label>
          <input name="validDate" type="date" className="field-input" />
        </div>
      ) : (
        <>
          <div>
            <label className="field-label">Desde</label>
            <input name="startDate" type="date" className="field-input" />
          </div>
          <div>
            <label className="field-label">Hasta</label>
            <input name="endDate" type="date" className="field-input" />
          </div>
        </>
      )}
      {type !== 'entrega' && (
        <div>
          <label className="field-label">Placa (opcional)</label>
          <input name="vehiclePlate" className="field-input w-28" />
        </div>
      )}
      <SubmitButton />
      {state.errors?.visitorName && <p className="w-full text-xs text-danger">{state.errors.visitorName[0]}</p>}
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
