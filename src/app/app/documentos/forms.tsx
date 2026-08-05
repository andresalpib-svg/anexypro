'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { createDocumentAction, addVersionAction, setBodyTextAction, type ActionState } from './actions';

export function NewDocumentForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createDocumentAction, {});
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
        <Plus size={16} /> Nuevo documento
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="card space-y-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Título</label>
          <input name="title" className="field-input" placeholder="Reglamento interno" />
          {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
        </div>
        <div>
          <label className="field-label">Categoría</label>
          <select name="category" defaultValue="reglamento" className="field-input">
            <option value="reglamento">Reglamento</option>
            <option value="contrato">Contrato</option>
            <option value="manual">Manual</option>
            <option value="seguro">Seguro</option>
            <option value="garantia">Garantía</option>
            <option value="plano">Plano</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="field-label">Visibilidad</label>
          <select name="visibility" defaultValue="admin" className="field-input">
            <option value="admin">Solo administración</option>
            <option value="residentes">Residentes también</option>
          </select>
        </div>
        <div>
          <label className="field-label">Vence (opcional)</label>
          <input name="expiresOn" type="date" className="field-input" />
        </div>
        <div>
          <label className="field-label">Nombre del archivo</label>
          <input name="fileName" className="field-input" placeholder="reglamento-v1.pdf" />
        </div>
        <div>
          <label className="field-label">URL del archivo</label>
          <input name="fileUrl" className="field-input" placeholder="https://…" />
          {state.errors?.fileUrl && <p className="mt-1 text-xs text-danger">{state.errors.fileUrl[0]}</p>}
        </div>
      </div>
      <p className="text-xs text-muted">
        Esta primera pasada no incluye carga de archivos real — pega la URL de dónde ya vive el
        documento (Google Drive, etc.).
      </p>
      <div className="flex gap-2">
        <SubmitButton label="Guardar" />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function NewVersionForm({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(addVersionAction, {});
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
        <Plus size={13} /> Nueva versión
      </button>
    );
  }
  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="documentId" value={documentId} />
      <div>
        <label className="field-label">Nombre del archivo</label>
        <input name="fileName" className="field-input w-40" />
      </div>
      <div>
        <label className="field-label">URL</label>
        <input name="fileUrl" className="field-input w-52" />
      </div>
      <SubmitButton label="Agregar" />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
        Cancelar
      </button>
    </form>
  );
}

export function BodyTextForm({ documentId, currentText }: { documentId: string; currentText: string | null }) {
  const [open, setOpen] = useState(!!currentText === false ? false : false);
  const [state, formAction] = useFormState<ActionState, FormData>(setBodyTextAction, {});
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
        {currentText ? 'Editar contenido de texto' : 'Agregar contenido de texto (para el Árbitro Legal IA)'}
      </button>
    );
  }
  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg bg-canvas p-3">
      <input type="hidden" name="documentId" value={documentId} />
      <p className="text-xs text-muted">
        Pega aquí el texto completo del documento. Solo se usa para que el Árbitro Legal IA cite este
        contenido con exactitud — nunca inventa artículos que no estén aquí.
      </p>
      <textarea name="bodyText" defaultValue={currentText ?? ''} rows={8} className="field-input" />
      {state.errors?.bodyText && <p className="text-xs text-danger">{state.errors.bodyText[0]}</p>}
      <div className="flex gap-2">
        <SubmitButton label="Guardar contenido" />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? '…' : label}
    </button>
  );
}
