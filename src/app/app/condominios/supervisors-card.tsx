'use client';

import { useState, useTransition } from 'react';
import { UserPlus, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { assignSupervisorAction, removeSupervisorAction } from './actions';

export type SupervisorItem = { id: string; user: { id: string; fullName: string; email: string } };
type StaffOpt = { id: string; fullName: string };

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
  const full = supervisors.length >= max;

  return (
    <div className="card mt-4 p-5">
      <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <ShieldCheck size={14} /> Supervisores asignados ({supervisors.length}/{max})
      </p>
      <p className="mb-3 text-xs text-muted">
        Usuarios del equipo responsables de este condominio.
      </p>

      <ul className="space-y-1.5">
        {supervisors.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 text-sm">
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-royal-soft text-xs font-bold text-royal">
              {s.user.fullName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{s.user.fullName}</span>
              <span className="block truncate text-xs text-muted">{s.user.email}</span>
            </span>
            {canManage && (
              <button
                type="button"
                disabled={pending}
                title="Quitar supervisor"
                className="ml-auto text-muted transition hover:text-danger disabled:opacity-50"
                onClick={() =>
                  startTransition(async () => {
                    const r = await removeSupervisorAction(condominiumId, s.id);
                    if (r.ok) toast.success('Supervisor removido.');
                    else toast.error(r.error);
                  })
                }
              >
                <X size={14} />
              </button>
            )}
          </li>
        ))}
        {supervisors.length === 0 && <li className="text-sm text-muted">Sin supervisores asignados todavía.</li>}
      </ul>

      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={full || available.length === 0}
            className="field-input flex-1 py-1.5 text-xs"
          >
            <option value="">
              {full
                ? `Límite de ${max} alcanzado`
                : available.length === 0
                  ? 'Todo el equipo ya está asignado'
                  : 'Seleccionar usuario del equipo…'}
            </option>
            {!full &&
              available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={pending || !selected || full}
            className="btn-primary py-1.5 text-xs disabled:opacity-50"
            onClick={() =>
              startTransition(async () => {
                const r = await assignSupervisorAction(condominiumId, selected);
                if (r.ok) {
                  toast.success('Supervisor asignado.');
                  setSelected('');
                } else toast.error(r.error);
              })
            }
          >
            <UserPlus size={13} /> Asignar
          </button>
        </div>
      )}
    </div>
  );
}
