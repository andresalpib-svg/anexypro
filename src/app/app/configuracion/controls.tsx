'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, KeyRound, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  toggleStaffPermissionAction,
  toggleBoardMemberAction,
  toggleBoardAreaAction,
  inviteUserAction,
  searchUsersAction,
  setUserPasswordAction,
  type ActionState,
  type ManageableUser,
  type ToggleResult,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';

/**
 * Marca la casilla, guarda, y si el servidor dice que no pudo, la
 * devuelve a donde estaba y explica por qué.
 *
 * Antes se llamaba a la acción y se olvidaba la promesa: un fallo del
 * servidor viajaba hasta la frontera de error y borraba la pantalla
 * entera ("Algo salió mal" + código), dejando además la casilla marcada
 * como si el cambio hubiera quedado guardado.
 */
async function guardar(
  e: React.ChangeEvent<HTMLInputElement>,
  llamada: () => Promise<ToggleResult>
) {
  const casilla = e.target;
  const anterior = !casilla.checked;
  try {
    const r = await llamada();
    if (!r.ok) {
      casilla.checked = anterior;
      toast.error(r.error ?? 'No se pudo guardar el cambio.');
    }
  } catch {
    casilla.checked = anterior;
    toast.error('No se pudo guardar el cambio. Revisá la conexión e intentá de nuevo.');
  }
}

export function PermissionCheckbox({ userId, area, checked }: { userId: string; area: string; checked: boolean }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      onChange={(e) => guardar(e, () => toggleStaffPermissionAction(userId, area, e.target.checked))}
      className="h-4 w-4"
    />
  );
}

export function BoardMemberToggle({ personId, checked }: { personId: string; checked: boolean }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      onChange={(e) => guardar(e, () => toggleBoardMemberAction(personId, e.target.checked))}
      className="h-4 w-4"
    />
  );
}

export function BoardAreaCheckbox({ personId, area, checked, disabled }: { personId: string; area: string; checked: boolean; disabled: boolean }) {
  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={disabled}
      onChange={(e) => guardar(e, () => toggleBoardAreaAction(personId, area, e.target.checked))}
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

// ---------- Contraseña fijada a mano ----------

const ROL_ETIQUETA: Record<string, string> = {
  admin_staff: 'Supervisor',
  contador: 'Contador externo',
  seguridad: 'Oficial de seguridad',
  condomino: 'Condómino',
};

/**
 * Cambio manual de la contraseña de un usuario de la empresa.
 *
 * Es lo que la administración necesita cuando alguien llama porque
 * perdió el acceso: se busca al usuario, se le fija una contraseña y se
 * le dicta. La contraseña se escribe a la vista a propósito —hay que
 * poder leerla en voz alta— y quien la recibe la cambia después desde
 * su propio perfil.
 */
export function PasswordManager() {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ManageableUser[]>([]);
  const [elegido, setElegido] = useState<ManageableUser | null>(null);
  const [buscando, iniciarBusqueda] = useTransition();
  const [state, formAction] = useFormState<ActionState, FormData>(setUserPasswordAction, {});

  // Buscador con espera: se consulta cuando el usuario deja de teclear,
  // no en cada letra.
  useEffect(() => {
    if (elegido) return;
    const t = setTimeout(() => {
      enTransicion(iniciarBusqueda, async () => setResultados(await searchUsersAction(texto)));
    }, 250);
    return () => clearTimeout(t);
  }, [texto, elegido]);

  return (
    <section className="card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
        <KeyRound size={15} className="text-royal" /> Contraseña de un usuario
      </h2>
      <p className="mt-0.5 text-xs text-muted">
        Buscá al supervisor, contador, oficial de seguridad o condómino que perdió el acceso y fijale
        una contraseña. Queda registrado en la bitácora quién se la cambió y a quién — nunca la
        contraseña. Tu propia contraseña se cambia desde Mi Perfil.
      </p>

      {!elegido ? (
        <div className="mt-4 max-w-lg">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre o correo del usuario"
              className="field-input pl-9"
            />
          </div>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
            {buscando && resultados.length === 0 && <li className="px-3 py-3 text-sm text-muted">Buscando…</li>}
            {!buscando && resultados.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted">Sin usuarios que coincidan.</li>
            )}
            {resultados.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setElegido(u)}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-left text-sm transition hover:bg-canvas"
                >
                  <span className="font-medium text-ink">{u.fullName}</span>
                  <span className="text-xs text-muted">{u.email}</span>
                  <span className="chip ml-auto bg-royal-soft text-[.65rem] text-royal">
                    {ROL_ETIQUETA[u.role] ?? u.role}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form action={formAction} className="mt-4 max-w-lg space-y-3" key={state.success ? 'ok' : elegido.id}>
          <input type="hidden" name="userId" value={elegido.id} />
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
            <span className="font-semibold text-ink">{elegido.fullName}</span>
            <span className="text-xs text-muted">{elegido.email}</span>
            <button
              type="button"
              onClick={() => {
                setElegido(null);
                setResultados([]);
                setTexto('');
              }}
              className="ml-auto text-xs font-semibold text-royal hover:underline"
            >
              Cambiar de usuario
            </button>
          </div>

          <div>
            <label className="field-label">Contraseña nueva</label>
            <input name="nueva" type="text" autoComplete="off" className="field-input" />
          </div>
          <div>
            <label className="field-label">Repetir la contraseña</label>
            <input name="repetir" type="text" autoComplete="off" className="field-input" />
          </div>

          {state.formError && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>
          )}
          {state.success && (
            <p className="flex items-center gap-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
              <CheckCircle2 size={15} /> Contraseña cambiada. Entregasela al usuario y pedile que la
              cambie desde su perfil.
            </p>
          )}
          <FijarBoton />
        </form>
      )}
    </section>
  );
}

function FijarBoton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Fijar contraseña'}
    </button>
  );
}
