'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Lock, Unlock, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { StatusChip } from '@/components/ui/status-chip';
import { resetPasswordAction, setUserStatusAction } from '../actions';
import { Credenciales } from '../empresas/new-company-form';
import { UserDetail } from './user-detail';

const ROL: Record<string, string> = {
  admin_owner: 'Administrador',
  admin_staff: 'Supervisor',
  contador: 'Contador',
  seguridad: 'Seguridad',
  condomino: 'Condómino',
  master: 'Master',
};

export type UsuarioFila = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  companyName: string;
};

export function UserTable({ usuarios }: { usuarios: UsuarioFila[] }) {
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [detalle, setDetalle] = useState<UsuarioFila | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function restablecer(u: UsuarioFila) {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.fullName}? La actual dejará de servir.`)) return;
    setError(null);
    start(async () => {
      const r = await resetPasswordAction(u.id);
      if (r.error) setError(r.error);
      else if (r.email && r.password) setReset({ email: r.email, password: r.password });
      router.refresh();
    });
  }

  function alternar(u: UsuarioFila) {
    start(async () => {
      const r = await setUserStatusAction(u.id, u.status === 'activo' ? 'bloqueado' : 'activo');
      if (!r.ok) setError(r.error ?? 'No se pudo actualizar.');
      router.refresh();
    });
  }

  return (
    <>
      {error && <p className="mb-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Último ingreso</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  Ningún usuario coincide con la búsqueda.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-ink">{u.fullName}</span>
                    <span className="text-xs text-muted">{u.email}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{u.companyName}</td>
                  <td className="px-4 py-3 text-muted">{ROL[u.role] ?? u.role}</td>
                  <td className="px-4 py-3 text-muted">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('es-CR') : 'nunca'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip variant={u.status === 'activo' ? 'ok' : 'danger'}>
                      {u.status === 'activo' ? 'Activo' : u.status}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDetalle(u)}
                        title="Ver la información del usuario"
                        className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                      >
                        <Eye size={15} />
                      </button>
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detalle && (
        <Modal title={detalle.fullName} subtitle={detalle.email} onClose={() => setDetalle(null)}>
          <UserDetail userId={detalle.id} />
        </Modal>
      )}

      {reset && (
        <Modal title="Contraseña restablecida" onClose={() => setReset(null)}>
          <Credenciales email={reset.email} password={reset.password} onCerrar={() => setReset(null)} />
        </Modal>
      )}
    </>
  );
}
