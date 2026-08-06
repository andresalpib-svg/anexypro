'use client';

import { useState, useTransition } from 'react';
import { UserPlus, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ejecutar, enTransicion } from '@/lib/accion-segura';
import { assignSupervisorAction, removeSupervisorAction } from './actions';

export type SupervisorItem = { id: string; user: { id: string; fullName: string; email: string; role: string } };
type StaffOpt = { id: string; fullName: string; role: string };

const ROL_ETIQUETA: Record<string, string> = {
  admin_owner: 'Administrador',
  admin_staff: 'Supervisor',
  seguridad: 'Seguridad',
};

export function SupervisorsCard({
  condominiumId,
  supervisors,
  staff,
  canManage,
  max,
}: {
  condominiumId: string;
  supervisors: SupervisorItem[];
  staff: StaffOpt[];
  canManage: boolean;
  max: number;
}) {
  const [selected, setSelected] = useState('');
  const [pending, startTransition] = useTransition();

  const assignedIds = new Set(supervisors.map((s) => s.user.id));
  const available = staff.filter((u) => !assignedIds.has(u.id));
  // El tope es del equipo de administración: la caseta no cuenta.
  const equipo = supervisors.filter((s) => s.user.role !== 'seguridad');
  const full = equipo.length >= max;

  return (
    <div className="card mt-4 p-4 sm:p-5">
      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <ShieldCheck size={14} /> Usuarios asignados (supervisores {equipo.length}/{max})
      </p>
      <p className="mb-3 text-xs text-muted">
        Quién responde por este condominio y qué oficiales de seguridad lo atienden. La asignación
        también DELIMITA lo que cada uno ve: un usuario asignado a este condominio no tiene acceso a
        la información de los demás.
      </p>

      <ul className="space-y-1.5">
        {supervisors.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 text-sm">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-royal-soft text-xs font-bold text-royal">
              {s.user.fullName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">
                {s.user.fullName}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  · {ROL_ETIQUETA[s.user.role] ?? s.user.role}
                </span>
              </span>
              <span className="block truncate text-xs text-muted">{s.user.email}</span>
            </span>
            {canManage && (
              <button
                type="button"
                disabled={pending}
                title="Quitar del condominio"
                className="ml-auto text-muted transition hover:text-danger disabled:opacity-50"
                onClick={() =>
                  enTransicion(startTransition, async () => {
                    const r = await ejecutar(() => removeSupervisorAction(condominiumId, s.id));
                    if (!r) return; // el aviso ya lo dio `ejecutar`
                    if (r.ok) toast.success('Usuario removido del condominio.');
                    else toast.error(r.error);
                  })
                }
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
        {supervisors.length === 0 && <li className="text-sm text-muted">Sin usuarios asignados todavía.</li>}
      </ul>

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={available.length === 0}
            className="field-input min-w-48 flex-1 py-1.5 text-xs"
          >
            <option value="">
              {available.length === 0 ? 'Todo el equipo ya está asignado' : 'Seleccionar usuario…'}
            </option>
            {available
              // Con el tope alcanzado se siguen pudiendo asignar
              // oficiales de seguridad: el límite es de supervisores.
              .filter((u) => !full || u.role === 'seguridad')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {ROL_ETIQUETA[u.role] ?? u.role}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={pending || !selected}
            className="btn-primary py-1.5 text-xs disabled:opacity-50"
            onClick={() =>
              enTransicion(startTransition, async () => {
                const r = await ejecutar(() => assignSupervisorAction(condominiumId, selected));
                if (!r) return; // el aviso ya lo dio `ejecutar`
                if (r.ok) {
                  toast.success('Usuario asignado al condominio.');
                  setSelected('');
                } else toast.error(r.error);
              })
            }
          >
            <UserPlus size={13} /> Asignar
          </button>
          {full && (
            <p className="w-full text-xs text-muted">
              Límite de {max} supervisores alcanzado — quitá uno para asignar otro. Los oficiales de
              seguridad no cuentan para ese límite.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
