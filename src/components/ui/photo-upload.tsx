'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

export type PhotoState = { formError?: string; success?: boolean };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? 'Subiendo…' : 'Guardar fotografía'}
    </button>
  );
}

/** Avatar con carga de fotografía — lo usan el residente y el equipo administrativo. */
export function PhotoUpload({
  action,
  photoUrl,
  name,
}: {
  action: (prev: PhotoState, formData: FormData) => Promise<PhotoState>;
  photoUrl: string | null;
  name: string;
}) {
  const [state, formAction] = useFormState<PhotoState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      toast.success('Fotografía actualizada.');
    }
  }, [state.success]);

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={photoUrl} alt={name} className="h-20 w-20 flex-none rounded-full border border-line object-cover" />
      ) : (
        <span className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-royal-soft text-2xl font-bold text-royal">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <form ref={ref} action={formAction} className="min-w-0">
        <label className="field-label flex items-center gap-1.5">
          <Camera size={13} /> Fotografía {photoUrl && '(reemplaza la actual)'}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" required className="field-input w-56 text-xs" />
          <SaveButton />
        </div>
        {state.formError && <p className="mt-1 text-xs font-medium text-danger">{state.formError}</p>}
      </form>
    </div>
  );
}
