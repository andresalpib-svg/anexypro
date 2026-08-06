'use client';

import { useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Pencil, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { ejecutar, enTransicion } from '@/lib/accion-segura';
import { updatePersonAction, removeMemberAction, type ActionState } from './resident-actions';

const ROLE_LABEL: Record<string, string> = {
  propietario: 'Propietario',
  residente: 'Residente',
  inquilino: 'Inquilino',
  familiar: 'Familiar',
  empleado: 'Empleado',
};

export type ResidentRowData = {
  memberId: string;
  role: string;
  person: { id: string; fullName: string; idNumber: string | null; email: string | null; phone: string | null };
  property: { id: string; code: string };
};

export function ResidentRow({ resident }: { resident: ResidentRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(updatePersonAction, {});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state.success]);

  if (editing) {
    return (
      <tr className="border-b border-line last:border-0">
        <td colSpan={5} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
            <input type="hidden" name="personId" value={resident.person.id} />
            <div>
              <label className="field-label">Nombre completo</label>
              <input name="fullName" defaultValue={resident.person.fullName} className="field-input w-52" />
            </div>
            <div>
              <label className="field-label">Cédula</label>
              <input name="idNumber" defaultValue={resident.person.idNumber ?? ''} className="field-input w-32" />
            </div>
            <div>
              <label className="field-label">Correo</label>
              <input name="email" type="email" defaultValue={resident.person.email ?? ''} className="field-input w-48" />
            </div>
            <div>
              <label className="field-label">Teléfono</label>
              <input name="phone" defaultValue={resident.person.phone ?? ''} className="field-input w-32" />
            </div>
            <SaveButton />
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost py-1.5 text-xs">
              Cancelar
            </button>
            {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
            {state.errors &&
              Object.values(state.errors).map((msgs, i) => (
                <p key={i} className="w-full text-xs text-danger">
                  {msgs?.[0]}
                </p>
              ))}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-line last:border-0 hover:bg-canvas">
      <td className="px-4 py-3 font-medium text-ink">{resident.person.fullName}</td>
      <td className="px-4 py-3">
        <StatusChip variant="royal">{ROLE_LABEL[resident.role] ?? resident.role}</StatusChip>
      </td>
      {/*
        La unidad ya no se repite en cada fila: ahora cada residente
        cuelga de la fila de su unidad, así que aquí va la cédula, que
        antes no se veía en el listado.
      */}
      <td className="px-4 py-3 text-muted">{resident.person.idNumber || '—'}</td>
      <td className="px-4 py-3 text-muted">
        {[resident.person.phone, resident.person.email].filter(Boolean).join(' · ') || '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-muted transition hover:text-royal" title="Editar datos">
            <Pencil size={14} />
          </button>
          <button
            type="button"
            disabled={pending}
            title="Dar de baja de la unidad"
            onClick={() => {
              if (
                !window.confirm(
                  `¿Dar de baja a ${resident.person.fullName} de la unidad ${resident.property.code}? El historial se conserva.`
                )
              )
                return;
              enTransicion(startTransition, async () => {
                const r = await ejecutar(() =>
                  removeMemberAction(resident.memberId, resident.property.id)
                );
                if (!r) return; // el aviso ya lo dio `ejecutar`
                if (r.ok) toast.success('Residente dado de baja de la unidad.');
                else toast.error(r.error ?? 'No se pudo dar de baja al residente.');
              });
            }}
            className="text-muted transition hover:text-danger disabled:opacity-50"
          >
            <UserMinus size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
}
