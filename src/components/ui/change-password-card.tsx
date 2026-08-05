'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { changeMyPasswordAction, type PasswordState } from '@/lib/actions/change-password';

const VACIO: PasswordState = {};

/**
 * Cambio de contraseña, para cualquier rol.
 *
 * Se usa igual en Mi Perfil del panel y en el perfil del residente: la
 * necesidad es la misma y el formulario también.
 */
export function ChangePasswordCard() {
  const [state, formAction] = useFormState(changeMyPasswordAction, VACIO);

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
        <KeyRound size={15} className="text-royal" /> Contraseña
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        Si la administración te entregó una contraseña temporal, cambiala por una tuya.
      </p>

      <form action={formAction} className="mt-4 max-w-sm space-y-3" key={state.success ? 'ok' : 'form'}>
        <Campo label="Contraseña actual">
          <input name="actual" type="password" autoComplete="current-password" className="field-input w-full" />
        </Campo>
        <Campo label="Contraseña nueva">
          <input name="nueva" type="password" autoComplete="new-password" className="field-input w-full" />
        </Campo>
        <Campo label="Repetir la contraseña nueva">
          <input name="repetir" type="password" autoComplete="new-password" className="field-input w-full" />
        </Campo>

        {state.formError && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>
        )}
        {state.success && (
          <p className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
            <CheckCircle2 size={15} /> Contraseña cambiada.
          </p>
        )}

        <Guardar />
      </form>
    </section>
  );
}

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Cambiando…' : 'Cambiar contraseña'}
    </button>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
