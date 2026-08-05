'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { FileSpreadsheet } from 'lucide-react';
import { importExcelAction, type ImportState } from './resident-actions';

export function ImportExcelForm({ condominiumId }: { condominiumId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ImportState, FormData>(importExcelAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-1.5 text-xs">
        <FileSpreadsheet size={14} /> Importar Excel
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="w-full rounded-lg bg-canvas p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Base de datos en Excel (unidades y residentes)</label>
          <input name="excelFile" type="file" accept=".xlsx,.xls" required className="field-input" />
        </div>
        <SubmitButton />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
          Cerrar
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Formato: Filial · Nombre · Apellidos · Cédula · Correo · Teléfono · Placa y marca · Habitantes · Visitas recurrentes.{' '}
        <a href="/app/propiedades/plantilla" className="font-semibold text-royal hover:underline">
          Descargar plantilla
        </a>
      </p>
      {state.formError && <p className="mt-2 text-xs font-medium text-danger">{state.formError}</p>}
      {state.summary && <p className="mt-2 text-xs font-medium text-ok">{state.summary}</p>}
      {state.skipped && state.skipped.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-warn">
          {state.skipped.slice(0, 10).map((s) => (
            <li key={s}>{s}</li>
          ))}
          {state.skipped.length > 10 && <li>… y {state.skipped.length - 10} filas más.</li>}
        </ul>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? 'Importando…' : 'Importar'}
    </button>
  );
}
