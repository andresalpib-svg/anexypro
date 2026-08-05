'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import type { ActionState } from './resident-actions';

export type FieldConfig = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'select' | 'password';
  options?: { value: string; label: string }[];
  placeholder?: string;
  width?: string;
};

export function InlineAddForm({
  action,
  propertyId,
  fields,
  buttonLabel,
  triggerLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  propertyId: string;
  fields: FieldConfig[];
  buttonLabel: string;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
        <Plus size={14} /> {triggerLabel}
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="propertyId" value={propertyId} />
      {fields.map((f) => (
        <div key={f.name} style={{ width: f.width ?? '150px' }}>
          <label className="field-label" htmlFor={f.name}>
            {f.label}
          </label>
          {f.type === 'select' ? (
            <select id={f.name} name={f.name} className="field-input">
              {f.options!.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={f.name} name={f.name} type={f.type ?? 'text'} placeholder={f.placeholder} className="field-input" />
          )}
          {state.errors?.[f.name]?.[0] && <p className="mt-1 text-xs text-danger">{state.errors[f.name]?.[0]}</p>}
        </div>
      ))}
      <SubmitButton label={buttonLabel} />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
        Cancelar
      </button>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Guardando…' : label}
    </button>
  );
}
