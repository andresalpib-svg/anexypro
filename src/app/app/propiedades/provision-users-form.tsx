'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { MailPlus } from 'lucide-react';
import { provisionUsersAction, type ProvisionState } from './resident-actions';

export function ProvisionUsersForm({
  condominiumId,
  pendingCount,
  emailConfigured,
}: {
  condominiumId: string;
  pendingCount: number;
  emailConfigured: boolean;
}) {
  const [state, formAction] = useFormState<ProvisionState, FormData>(provisionUsersAction, {});

  return (
    <div className="card mt-6 p-5">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <MailPlus size={14} /> Usuarios del Ecosistema Condómino
      </p>
      <p className="mt-2 text-sm text-muted">
        Crea las cuentas de todos los residentes de este condominio en conjunto, usando únicamente el
        correo registrado de cada uno. La contraseña temporal, el usuario y el enlace de acceso llegan
        directo al correo del residente — nunca se muestran en pantalla.
      </p>

      {!emailConfigured && (
        <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-xs font-medium text-warn">
          Falta configurar el correo de la administración: agrega RESEND_API_KEY y EMAIL_FROM en el
          archivo .env (la guía completa, incluida la configuración anti-spam del dominio, está en
          .env.example).
        </p>
      )}

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="condominiumId" value={condominiumId} />
        <SubmitButton pendingCount={pendingCount} disabled={!emailConfigured || pendingCount === 0} />
        <span className="text-xs text-muted">
          {pendingCount === 0
            ? 'Todos los residentes con correo ya tienen su cuenta.'
            : `${pendingCount} residente(s) con correo registrado y sin cuenta.`}
        </span>
      </form>

      {state.formError && <p className="mt-3 text-xs font-medium text-danger">{state.formError}</p>}
      {state.summary && <p className="mt-3 text-xs font-medium text-ok">{state.summary}</p>}
      {state.errors && state.errors.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-warn">
          {state.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SubmitButton({ pendingCount, disabled }: { pendingCount: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className="btn-primary py-2 text-xs disabled:opacity-50">
      {pending ? 'Creando y enviando…' : `Crear usuarios y enviar correos (${pendingCount})`}
    </button>
  );
}
