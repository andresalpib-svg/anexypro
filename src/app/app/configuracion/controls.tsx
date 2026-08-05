'use client';

import { useState, useRef, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import { toggleStaffPermissionAction, toggleBoardMemberAction, toggleBoardAreaAction, inviteUserAction, type ActionState } from './actions';

export function PermissionCheckbox({ userId, area, checked }: { userId: string; area: string; checked: boolean }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      onChange={(e) => toggleStaffPermissionAction(userId, area, e.target.checked)}
      className="h-4 w-4"
    />
  );
}

export function BoardMemberToggle({ personId, checked }: { personId: string; checked: boolean }) {
  return (
    <input type="checkbox" defaultChecked={checked} onChange={(e) => toggleBoardMemberAction(personId, e.target.checked)} className="h-4 w-4" />
  );
}

export function BoardAreaCheckbox({ personId, area, checked, disabled }: { personId: string; area: string; checked: boolean; disabled: boolean }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={disabled}
      onChange={(e) => toggleBoardAreaAction(personId, area, e.target.checked)}
      className="h-3.5 w-3.5"
    />
  );
}

export function InviteUserForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(inviteUserAction, {});
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
        <Plus size={16} /> Nuevo usuario de staff
      </button>
    );
  }
  return (
    <form ref={formRef} action={formAction} className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="field-label">Nombre</label>
        <input name="fullName" className="field-input w-40" />
        {state.errors?.fullName && <p className="mt-1 text-xs text-danger">{state.errors.fullName[0]}</p>}
      </div>
      <div>
        <label className="field-label">Correo</label>
        <input name="email" type="email" className="field-input w-48" />
        {state.errors?.email && <p className="mt-1 text-xs text-danger">{state.errors.email[0]}</p>}
      </div>
      <div>
        <label className="field-label">Contraseña temporal</label>
        <input name="tempPassword" className="field-input w-40" />
        {state.errors?.tempPassword && <p className="mt-1 text-xs text-danger">{state.errors.tempPassword[0]}</p>}
      </div>
      <SubmitButton />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
        Cancelar
      </button>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Creando…' : 'Crear usuario'}
    </button>
  );
}
