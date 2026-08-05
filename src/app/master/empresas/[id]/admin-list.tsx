'use client';

import { useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { UserPlus, KeyRound, Lock, Unlock } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { createAdminAction, resetPasswordAction, setUserStatusAction, type AltaState } from '../../actions';
import { Credenciales } from '../new-company-form';

const VACIO: AltaState = {};

const ROL: Record<string, string> = {
  admin_owner: 'Administrador',
  admin_staff: 'Supervisor',
  contador: 'Contador',
  seguridad: 'Seguridad',
  condomino: 'Condómino',
  master: 'Master',
};

type Usuario = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};

/** Usuarios de la empresa, con las acciones de auxilio del master. */
export function AdminList({ companyId, usuarios }: { companyId: string; usuarios: Usuario[] }) {
  const [creando, setCreando] = useState(false);
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function restablecer(u: Usuario) {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.fullName}? La actual dejará de servir.`)) return;
    setError(null);
    start(async () => {
      const r = await resetPasswordAction(u.id);
      if (r.error) setError(r.error);
      else if (r.email && r.password) setReset({ email: r.email, password: r.password });
      router.refresh();
    });
  }

  function alternar(u: Usuario) {
    const nuevo = u.status === 'activo' ? 'bloqueado' : 'activo';
    start(async () => {
      const r = await setUserStatusAction(u.id, nuevo as 'activo' | 'bloqueado');
      if (!r.ok) setError(r.error ?? 'No se pudo actualizar.');
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Usuarios ({usuarios.length})</h2>
        <button type="button" onClick={() => setCreando(true)} className="btn-ghost">
          <UserPlus size={15} /> Nuevo administrador
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <ul className="mt-3 divide-y divide-line">
        {usuarios.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{u.fullName}</p>
              <p className="truncate text-xs text-muted">{u.email}</p>
              <p className="text-xs text-muted">
                {ROL[u.role] ?? u.role}
                {u.lastLoginAt
                  ? ` · último ingreso ${new Date(u.lastLoginAt).toLocaleDateString('es-CR')}`
                  : ' · nunca ha ingresado'}
              </p>
            </div>

            <StatusChip variant={u.status === 'activo' ? 'ok' : 'danger'}>
              {u.status === 'activo' ? 'Activo' : u.status}
            </StatusChip>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => restablecer(u)}
                title="Restablecer contraseña"
                className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-royal"
              >
                <KeyRound size={15} />
              </button>
              {u.role !== 'master' && (
                <button
                  type="button"
                  onClick={() => alternar(u)}
                  title={u.status === 'activo' ? 'Bloquear el acceso' : 'Reactivar el acceso'}
                  className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                >
                  {u.status === 'activo' ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              )}
            </div>
          </li>
        ))}
        {usuarios.length === 0 && <li className="py-6 text-center text-sm text-muted">Sin usuarios.</li>}
      </ul>

      {creando && (
        <NuevoAdmin
          companyId={companyId}
          onClose={() => {
            setCreando(false);
            router.refresh();
          }}
        />
      )}

      {reset && (
        <Modal title="Contraseña restablecida" onClose={() => setReset(null)}>
          <Credenciales email={reset.email} password={reset.password} onCerrar={() => setReset(null)} />
        </Modal>
      )}
    </section>
  );
}

function NuevoAdmin({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [state, formAction] = useFormState(createAdminAction, VACIO);

  return (
    <Modal title={state.credenciales ? 'Administrador creado' : 'Nuevo administrador'} onClose={onClose}>
      {state.credenciales ? (
        <Credenciales
          email={state.credenciales.email}
          password={state.credenciales.password}
          onCerrar={onClose}
        />
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="companyId" value={companyId} />
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Nombre completo</span>
            <input name="fullName" className="field-input w-full" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Correo de acceso</span>
            <input name="email" type="email" className="field-input w-full" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">
              Contraseña (en blanco = se genera una)
            </span>
            <input name="password" className="field-input w-full" />
          </label>

          {state.formError && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.formError}</p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <Crear />
          </div>
        </form>
      )}
    </Modal>
  );
}

function Crear() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Creando…' : 'Crear administrador'}
    </button>
  );
}
