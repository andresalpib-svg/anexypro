'use client';

import { useMemo, useRef, useState, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, Search, Trash2, Paperclip, AlarmClock, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { Modal } from '@/components/ui/modal';
import { TASK_CATEGORIES } from '@/lib/validations/tasks';
import {
  createTaskAction,
  updateTaskAction,
  setTaskStatusAction,
  deleteTaskAction,
  addChecklistItemAction,
  toggleChecklistItemAction,
  deleteChecklistItemAction,
  addAttachmentAction,
  deleteAttachmentAction,
  type ActionState,
} from './actions';

export type TaskRow = {
  id: string;
  title: string;
  category: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  condominiumId: string | null;
  condominiumName: string | null;
  priority: string;
  dueDate: string; // YYYY-MM-DD o ''
  alarmAt: string; // YYYY-MM-DDTHH:mm o ''
  notes: string | null;
  status: string;
  checklist: { id: string; title: string; done: boolean }[];
  attachments: { id: string; fileName: string; fileUrl: string }[];
};

type UserOpt = { id: string; fullName: string };
type CondoOpt = { id: string; name: string };

const STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada' };
const STATUS_VARIANT: Record<string, 'neutral' | 'royal' | 'ok'> = { pendiente: 'neutral', en_progreso: 'royal', completada: 'ok' };
const PRIORITY_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' };
const PRIORITY_CLASS: Record<string, string> = { baja: 'text-muted', media: 'text-warn', alta: 'text-danger font-semibold' };

/** Presets de alarma relativos a la fecha límite (a las 8:00 am). */
const ALARM_PRESETS: { value: string; label: string; minutes: number }[] = [
  { value: '1h', label: '1 hora antes', minutes: 60 },
  { value: '3h', label: '3 horas antes', minutes: 180 },
  { value: '1d', label: '1 día antes', minutes: 60 * 24 },
  { value: '2d', label: '2 días antes', minutes: 60 * 24 * 2 },
  { value: '1w', label: '1 semana antes', minutes: 60 * 24 * 7 },
  { value: '2w', label: '2 semanas antes', minutes: 60 * 24 * 14 },
];

function computeAlarm(dueDate: string, minutesBefore: number): string {
  if (!dueDate) return '';
  const due = new Date(`${dueDate}T08:00:00`);
  const alarm = new Date(due.getTime() - minutesBefore * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${alarm.getFullYear()}-${p(alarm.getMonth() + 1)}-${p(alarm.getDate())}T${p(alarm.getHours())}:${p(alarm.getMinutes())}`;
}

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-xs">
      {pending ? busy : label}
    </button>
  );
}

/** Fecha límite + alarma (aviso obligatorio al vencer + alarma configurable). */
function DueAndAlarmFields({ initialDue, initialAlarm }: { initialDue: string; initialAlarm: string }) {
  const [due, setDue] = useState(initialDue);
  const [alarm, setAlarm] = useState(initialAlarm);

  return (
    <>
      <div>
        <label className="field-label">Fecha límite</label>
        <input name="dueDate" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field-input w-40" />
      </div>
      <div className="w-full rounded-lg bg-canvas p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
          <AlarmClock size={13} /> Alarma
        </p>
        <p className="mt-1 text-[.7rem] text-muted">
          El aviso en la fecha de vencimiento es obligatorio y siempre está activo. Aquí puedes agregar
          una alarma adicional antes de esa fecha.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">Avisar también</label>
            <select
              className="field-input"
              value=""
              onChange={(e) => {
                const preset = ALARM_PRESETS.find((p) => p.value === e.target.value);
                if (preset) setAlarm(computeAlarm(due, preset.minutes));
                if (e.target.value === 'none') setAlarm('');
              }}
            >
              <option value="" disabled>
                Elegir…
              </option>
              {ALARM_PRESETS.map((p) => (
                <option key={p.value} value={p.value} disabled={!due}>
                  {p.label}
                </option>
              ))}
              <option value="none">Sin alarma adicional</option>
            </select>
          </div>
          <div>
            <label className="field-label">Fecha y hora exactas (editable)</label>
            <input
              name="alarmAt"
              type="datetime-local"
              value={alarm}
              onChange={(e) => setAlarm(e.target.value)}
              className="field-input w-56"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function TaskFields({
  task,
  users,
  condos,
  canAssign,
}: {
  task?: TaskRow;
  users: UserOpt[];
  condos: CondoOpt[];
  canAssign: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <label className="field-label">Tarea</label>
        <input name="title" defaultValue={task?.title ?? ''} placeholder="Ej: Cotizar pintura del portón" className="field-input" />
      </div>
      <div>
        <label className="field-label">Categoría</label>
        <select name="category" defaultValue={task?.category ?? 'Administrativo'} className="field-input">
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Asignada a</label>
        {canAssign ? (
          <select name="assignedToId" defaultValue={task?.assignedToId ?? ''} className="field-input">
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        ) : (
          // El supervisor no reasigna tareas: conserva quien la tenga.
          <>
            <input type="hidden" name="assignedToId" value={task?.assignedToId ?? ''} />
            <p className="field-input bg-canvas text-muted">{task?.assignedToName ?? 'Sin asignar'}</p>
          </>
        )}
      </div>
      <div>
        <label className="field-label">Condominio</label>
        <select name="condominiumId" defaultValue={task?.condominiumId ?? ''} className="field-input">
          <option value="">Sin condominio</option>
          {condos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Prioridad</label>
        <select name="priority" defaultValue={task?.priority ?? 'media'} className="field-input">
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
      </div>
      <DueAndAlarmFields initialDue={task?.dueDate ?? ''} initialAlarm={task?.alarmAt ?? ''} />
      <div className="w-full">
        <label className="field-label">Notas</label>
        <textarea name="notes" defaultValue={task?.notes ?? ''} rows={2} className="field-input" />
      </div>
    </div>
  );
}

function Errors({ state }: { state: ActionState }) {
  if (!state.formError && !state.errors) return null;
  return (
    <div className="mt-2 space-y-0.5">
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((msgs, i) => (
          <p key={i} className="text-xs font-medium text-danger">
            {msgs?.[0]}
          </p>
        ))}
    </div>
  );
}

function NewTaskModal({
  users,
  condos,
  canAssign,
  onDone,
}: {
  users: UserOpt[];
  condos: CondoOpt[];
  canAssign: boolean;
  onDone: () => void;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(createTaskAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      toast.success('Tarea creada.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <Modal title="Nueva tarea" subtitle="Se crea sin salir del tablero" onClose={onDone}>
      <form ref={ref} action={formAction} className="p-5">
        <TaskFields users={users} condos={condos} canAssign={canAssign} />
        <div className="mt-3">
          <label className="field-label">Documento adjunto (opcional — luego puedes agregar más)</label>
          <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" className="field-input" />
        </div>
        <Errors state={state} />
        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          <SubmitButton label="Crear tarea" busy="Creando…" />
          <button type="button" onClick={onDone} className="btn-ghost py-2 text-xs">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskDetail({
  task,
  users,
  condos,
  canAssign,
}: {
  task: TaskRow;
  users: UserOpt[];
  condos: CondoOpt[];
  canAssign: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateTaskAction, {});
  const [checkState, checkAction] = useFormState<ActionState, FormData>(addChecklistItemAction, {});
  const [attachState, attachAction] = useFormState<ActionState, FormData>(addAttachmentAction, {});
  const checkRef = useRef<HTMLFormElement>(null);
  const attachRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  // Check optimista: el checkbox responde al instante y el servidor
  // reconcilia en la revalidación.
  const [optimisticDone, setOptimisticDone] = useState<Record<string, boolean>>({});
  useEffect(() => setOptimisticDone({}), [task.checklist]);

  useEffect(() => {
    if (state.success) toast.success('Tarea actualizada.');
  }, [state.success]);
  useEffect(() => {
    if (checkState.success) checkRef.current?.reset();
  }, [checkState.success]);
  useEffect(() => {
    if (attachState.success) attachRef.current?.reset();
  }, [attachState.success]);

  const done = task.checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-5 bg-canvas p-5">
      {/* ---------- Edición ---------- */}
      <form action={formAction}>
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="status" value={task.status} />
        <TaskFields task={task} users={users} condos={condos} canAssign={canAssign} />
        <Errors state={state} />
        <div className="mt-3">
          <SubmitButton label="Guardar cambios" busy="Guardando…" />
        </div>
      </form>

      <div className="grid grid-cols-2 gap-5">
        {/* ---------- Checklist ---------- */}
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Checklist {task.checklist.length > 0 && `(${done}/${task.checklist.length})`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {task.checklist.map((item) => {
              const checked = optimisticDone[item.id] ?? item.done;
              return (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setOptimisticDone((prev) => ({ ...prev, [item.id]: next }));
                    startTransition(async () => {
                      await toggleChecklistItemAction(item.id, next);
                    });
                  }}
                />
                <span className={checked ? 'text-muted line-through' : 'text-ink'}>{item.title}</span>
                <button
                  type="button"
                  className="ml-auto text-muted hover:text-danger"
                  title="Eliminar punto"
                  onClick={() => startTransition(async () => deleteChecklistItemAction(item.id))}
                >
                  <Trash2 size={13} />
                </button>
              </li>
              );
            })}
            {task.checklist.length === 0 && <li className="text-xs text-muted">Sin puntos todavía.</li>}
          </ul>
          <form ref={checkRef} action={checkAction} className="mt-3 flex gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            <input name="title" placeholder="Nuevo punto del checklist…" className="field-input flex-1 py-1.5 text-xs" />
            <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
              <Plus size={13} />
            </button>
          </form>
          <Errors state={checkState} />
        </div>

        {/* ---------- Adjuntos ---------- */}
        <div className="card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Documentos adjuntos {task.attachments.length > 0 && `(${task.attachments.length})`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {task.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Paperclip size={13} className="flex-none text-muted" />
                <a href={a.fileUrl} target="_blank" rel="noreferrer" className="truncate font-medium text-royal hover:underline">
                  {a.fileName}
                </a>
                <button
                  type="button"
                  className="ml-auto text-muted hover:text-danger"
                  title="Eliminar adjunto"
                  onClick={() => startTransition(async () => deleteAttachmentAction(a.id))}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {task.attachments.length === 0 && <li className="text-xs text-muted">Sin documentos todavía.</li>}
          </ul>
          <form ref={attachRef} action={attachAction} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="taskId" value={task.id} />
            <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" className="field-input flex-1 py-1.5 text-xs" />
            <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
              Adjuntar
            </button>
          </form>
          <Errors state={attachState} />
        </div>
      </div>

      {/* ---------- Estado + eliminar ---------- */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-semibold text-muted">Estado:</label>
        <select
          value={task.status}
          onChange={(e) => startTransition(async () => setTaskStatusAction(task.id, e.target.value))}
          className="field-input w-auto py-1.5 text-xs"
        >
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="completada">Completada</option>
        </select>
        <button
          type="button"
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline"
          onClick={() => {
            if (!window.confirm(`¿Eliminar la tarea "${task.title}"? Se pierden su checklist y adjuntos.`)) return;
            startTransition(async () => {
              const r = await deleteTaskAction(task.id);
              if (r.ok) toast.success('Tarea eliminada.');
              else toast.error(r.error);
            });
          }}
        >
          <Trash2 size={13} /> Eliminar tarea
        </button>
      </div>
    </div>
  );
}

export function TaskBoard({
  tasks,
  users,
  condos,
  canAssign,
}: {
  tasks: TaskRow[];
  users: UserOpt[];
  condos: CondoOpt[];
  /** Solo la administración reasigna tareas y elige condominio. */
  canAssign: boolean;
}) {
  const [category, setCategory] = useState('');
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [condo, setCondo] = useState('');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(tasks.map((t) => t.category).filter(Boolean))] as string[],
    [tasks]
  );

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;

  const visible = tasks.filter((t) => {
    if (category && t.category !== category) return false;
    if (person && t.assignedToId !== person) return false;
    if (condo && t.condominiumId !== condo) return false;
    if (status && t.status !== status) return false;
    if (query) {
      const q = query.toLowerCase();
      const haystack = `${t.title} ${t.category ?? ''} ${t.assignedToName ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field-input w-auto">
          <option value="">Toda categoría</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="field-input w-auto">
          <option value="">Toda persona</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </select>
        <select value={condo} onChange={(e) => setCondo(e.target.value)} className="field-input w-auto">
          <option value="">Todo condominio</option>
          {condos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field-input w-auto">
          <option value="">Todo estado</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="completada">Completada</option>
        </select>
        <button type="button" onClick={() => setShowNew(true)} className="btn-primary ml-auto">
          <Plus size={15} /> Nueva tarea
        </button>
      </div>

      <div className="relative mt-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar tarea en esta vista…"
          className="field-input pl-9"
        />
      </div>

      <div className="card mt-4 overflow-hidden border-t-4 border-t-royal">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Tarea</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Asignada a</th>
              <th className="px-4 py-3">Condominio</th>
              <th className="px-4 py-3">Prioridad</th>
              <th className="px-4 py-3">Fecha límite</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Sin tareas en esta vista.
                </td>
              </tr>
            ) : (
              visible.map((t) => (
                <TaskRowView key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNew && <NewTaskModal users={users} condos={condos} canAssign={canAssign} onDone={() => setShowNew(false)} />}
      {openTask && (
        <Modal
          title={openTask.title}
          subtitle={[openTask.category, openTask.condominiumName].filter(Boolean).join(' · ')}
          onClose={() => setOpenTaskId(null)}
          width="max-w-4xl"
        >
          <TaskDetail task={openTask} users={users} condos={condos} canAssign={canAssign} />
        </Modal>
      )}
    </div>
  );
}

function TaskRowView({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const extras: string[] = [];
  if (task.checklist.length) extras.push(`✓ ${task.checklist.filter((c) => c.done).length}/${task.checklist.length}`);
  if (task.attachments.length) extras.push(`📎 ${task.attachments.length}`);
  if (task.alarmAt) extras.push('⏰');

  return (
    <tr onClick={onOpen} className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{task.title}</p>
        {extras.length > 0 && <p className="text-[.7rem] text-muted">{extras.join(' · ')}</p>}
      </td>
      <td className="px-4 py-3">
        <p className="text-ink">{task.category ?? '—'}</p>
      </td>
      <td className="px-4 py-3 text-muted">{task.assignedToName ?? 'Sin asignar'}</td>
      <td className="px-4 py-3 text-muted">
        {task.condominiumName ? (
          <span className="inline-flex items-center gap-1.5">
            <Building2 size={13} className="flex-none" />
            {task.condominiumName}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className={`px-4 py-3 ${PRIORITY_CLASS[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</td>
      <td className="px-4 py-3 text-muted">{task.dueDate || '—'}</td>
      <td className="px-4 py-3">
        <StatusChip variant={STATUS_VARIANT[task.status]}>{STATUS_LABEL[task.status]}</StatusChip>
      </td>
    </tr>
  );
}
