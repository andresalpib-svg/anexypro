'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { createCommunicationAction, type ActionState } from '../actions';
import { generateDraftAction } from '../generate-actions';
import { enTransicion } from '@/lib/accion-segura';

export default function NuevoComunicadoPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const [state, formAction] = useFormState<ActionState, FormData>(createCommunicationAction, {});
  const [targetType, setTargetType] = useState('todos');

  const [instruction, setInstruction] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('aviso');
  const [genError, setGenError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setGenError(null);
    enTransicion(startTransition, async () => {
      const result = await generateDraftAction(instruction);
      if ('error' in result) {
        setGenError(result.error);
        return;
      }
      setTitle(result.title);
      setBody(result.body);
      setCategory(result.category);
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl font-bold text-ink">Nuevo comunicado</h1>
          <p className="mt-1 text-sm text-muted">Se guarda como borrador — decides cuándo publicarlo.</p>
        </div>
        <Link href="/app/comunicados" className="btn-ghost">
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>

      <div className="card mb-4 p-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-lumen">
          <Sparkles size={14} /> Generador de Comunicados
        </p>
        <p className="mb-3 text-sm text-muted">
          Describe qué quieres avisar y genera un primer borrador — siempre lo revisas y editas antes de
          guardarlo.
        </p>
        <div className="flex items-end gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Avisar corte de agua mañana de 8am a 2pm por mantenimiento de cisterna"
            className="field-input flex-1"
          />
          <button type="button" onClick={handleGenerate} disabled={isPending} className="btn-ia">
            {isPending ? 'Generando…' : 'Generar borrador'}
          </button>
        </div>
        {genError && <p className="mt-2 text-xs text-danger">{genError}</p>}
      </div>

      <form action={formAction} className="card space-y-5 p-6">
        <input type="hidden" name="condominiumId" value={searchParams.condoId ?? ''} />

        {state.formError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{state.formError}</p>
        )}

        <div>
          <label className="field-label" htmlFor="title">
            Título
          </label>
          <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" placeholder="Corte programado de agua" />
          {state.errors?.title && <p className="mt-1 text-xs text-danger">{state.errors.title[0]}</p>}
        </div>

        <div>
          <label className="field-label" htmlFor="category">
            Categoría
          </label>
          <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="field-input">
            <option value="aviso">Aviso</option>
            <option value="noticia">Noticia</option>
            <option value="urgente">Urgente</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="asamblea">Asamblea</option>
            <option value="recordatorio_pago">Recordatorio de pago</option>
            <option value="suspension">Suspensión</option>
          </select>
        </div>

        <div>
          <label className="field-label" htmlFor="body">
            Contenido
          </label>
          <textarea id="body" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="field-input" />
          {state.errors?.body && <p className="mt-1 text-xs text-danger">{state.errors.body[0]}</p>}
        </div>

        <div>
          <label className="field-label">Audiencia</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="targetType"
                value="todos"
                checked={targetType === 'todos'}
                onChange={() => setTargetType('todos')}
              />
              Todos los residentes
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="targetType"
                value="rol"
                checked={targetType === 'rol'}
                onChange={() => setTargetType('rol')}
              />
              Solo un rol específico
            </label>
          </div>
          {targetType === 'rol' && (
            <select name="targetRole" defaultValue="propietario" className="field-input mt-2 max-w-xs">
              <option value="propietario">Propietarios</option>
              <option value="residente">Residentes</option>
              <option value="inquilino">Inquilinos</option>
            </select>
          )}
        </div>

        <div>
          <label className="field-label" htmlFor="files">
            Adjuntos (documentos, imágenes o videos — opcional)
          </label>
          <input
            id="files"
            name="files"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm"
            className="field-input"
          />
          <p className="mt-1 text-xs text-muted">Puedes seleccionar varios archivos. Máximo 100 MB por archivo.</p>
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? 'Guardando…' : 'Guardar borrador'}
    </button>
  );
}
