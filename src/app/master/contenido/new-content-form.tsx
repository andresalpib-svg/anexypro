'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createContentAction, type ActionState } from './actions';

const CATEGORY_OPTIONS = [
  { value: 'video', label: 'Video' },
  { value: 'manual', label: 'Manual' },
  { value: 'reglamento', label: 'Reglamento' },
  { value: 'curso', label: 'Curso' },
  { value: 'consejo', label: 'Consejo' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'reciclaje', label: 'Reciclaje' },
  { value: 'seguridad', label: 'Seguridad' },
];

export function NewContentForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createContentAction, {});
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
        <Plus size={16} /> Nuevo contenido
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card space-y-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Título</label>
          <input name="title" className="field-input" placeholder="Cómo reciclar en el condominio" />
          {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
        </div>
        <div>
          <label className="field-label">Categoría</label>
          <select name="category" defaultValue="consejo" className="field-input">
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">URL de video (opcional)</label>
          <input name="videoUrl" className="field-input" placeholder="https://…" />
        </div>
        <div>
          <label className="field-label">URL de archivo (opcional)</label>
          <input name="fileUrl" className="field-input" placeholder="https://…" />
        </div>
      </div>
      <div>
        <label className="field-label">Descripción</label>
        <textarea name="description" rows={2} className="field-input" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="publish" value="true" defaultChecked />
        Publicar de inmediato para los residentes
      </label>
      <div className="flex gap-2">
        <SubmitButton />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancelar
        </button>
      </div>
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
