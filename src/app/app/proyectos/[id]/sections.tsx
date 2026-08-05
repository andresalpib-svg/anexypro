'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Check } from 'lucide-react';
import {
  addChecklistItemAction,
  toggleChecklistItemAction,
  addUpdateAction,
  setProjectStatusAction,
  type ActionState,
} from '../actions';

export function StatusSelect({ projectId, status }: { projectId: string; status: string }) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => setProjectStatusAction(projectId, e.target.value)}
      className="field-input w-44"
    >
      <option value="planificado">Planificado</option>
      <option value="en_progreso">En progreso</option>
      <option value="pausado">Pausado</option>
      <option value="completado">Completado</option>
      <option value="cancelado">Cancelado</option>
    </select>
  );
}

export function ChecklistBox({
  projectId,
  items,
}: {
  projectId: string;
  items: { id: string; title: string; done: boolean }[];
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(addChecklistItemAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="card p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Checklist</p>
      <ul className="mb-3 space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={i.done} onChange={(e) => toggleChecklistItemAction(i.id, projectId, e.target.checked)} />
            <span className={i.done ? 'text-muted line-through' : 'text-ink'}>{i.title}</span>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-muted">Sin pendientes.</p>}
      </ul>
      <form ref={formRef} action={formAction} className="flex gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input name="title" placeholder="Nuevo pendiente" className="field-input flex-1 text-xs" />
        <button type="submit" className="btn-ghost py-1.5 text-xs">
          <Plus size={13} />
        </button>
      </form>
    </div>
  );
}

export function UpdatesSection({ projectId, updates }: { projectId: string; updates: { id: string; description: string; progressPct: number | null; createdAt: Date }[] }) {
  const [state, formAction] = useFormState<ActionState, FormData>(addUpdateAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="card p-5">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Avances</p>
      <ul className="mb-3 space-y-2">
        {updates.map((u) => (
          <li key={u.id} className="border-b border-line pb-2 text-sm last:border-0">
            <p className="text-ink">
              {u.description} {u.progressPct != null && <span className="text-muted">· {u.progressPct}%</span>}
            </p>
            <p className="text-xs text-muted">{new Date(u.createdAt).toLocaleDateString('es-CR')}</p>
          </li>
        ))}
        {updates.length === 0 && <p className="text-sm text-muted">Sin avances registrados.</p>}
      </ul>
      <form ref={formRef} action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input name="description" placeholder="Descripción del avance" className="field-input flex-1 text-xs" />
        <input name="progressPct" type="number" min="0" max="100" placeholder="%" className="field-input w-16 text-xs" />
        <SubmitButton label="Agregar" />
      </form>
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? '…' : label}
    </button>
  );
}
