'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Waves, Clock, Trash2, FileText, Pencil, CalendarX } from 'lucide-react';
import { toast } from 'sonner';
import {
  addScheduleAction,
  deleteScheduleAction,
  updateAmenityAction,
  deleteAmenityAction,
  type ActionState,
} from './actions';
import { enTransicion } from '@/lib/accion-segura';

export type AmenityCard = {
  id: string;
  name: string;
  capacity: number | null;
  reservationCost: string;
  requiresApproval: boolean;
  rulesUrl: string | null;
  photoUrl: string | null;
  exclusivePerDay: boolean;
  maxHours: number | null;
  advanceDays: number;
  status: string;
  schedules: { id: string; dayOfWeek: number; opensAt: string; closesAt: string }[];
};

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function ScheduleEditor({ amenity }: { amenity: AmenityCard }) {
  const [state, formAction] = useFormState<ActionState, FormData>(addScheduleAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      toast.success('Bloque de horario agregado.');
    }
  }, [state.success]);

  return (
    <div className="mt-3 rounded-lg bg-canvas p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Clock size={12} /> Horario de uso por bloques
      </p>
      {amenity.schedules.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Sin bloques definidos — el área se puede reservar en cualquier horario.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {amenity.schedules.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-xs text-ink">
              <span className="w-9 font-semibold">{DAYS_SHORT[b.dayOfWeek]}</span>
              <span className="text-muted">
                {b.opensAt}–{b.closesAt}
              </span>
              <button
                type="button"
                title="Eliminar bloque"
                className="ml-auto text-muted hover:text-danger"
                onClick={() => enTransicion(startTransition, async () => deleteScheduleAction(b.id))}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form ref={ref} action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="amenityId" value={amenity.id} />
        <div className="flex flex-wrap gap-1.5">
          {DAYS_SHORT.map((d, i) => (
            <label key={d} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink has-[:checked]:border-royal has-[:checked]:bg-royal-soft has-[:checked]:text-royal">
              <input type="checkbox" name="days" value={i} className="sr-only" />
              {d}
            </label>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="field-label">De</label>
            <input name="opensAt" type="time" className="field-input w-24 py-1 text-xs" />
          </div>
          <div>
            <label className="field-label">A</label>
            <input name="closesAt" type="time" className="field-input w-24 py-1 text-xs" />
          </div>
          <AddBlockButton />
        </div>
        {state.formError && <p className="text-xs text-danger">{state.formError}</p>}
      </form>
    </div>
  );
}

function AddBlockButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-ghost py-1.5 text-xs">
      {pending ? 'Guardando…' : 'Agregar bloque'}
    </button>
  );
}


function AmenityEditor({ amenity, onDone }: { amenity: AmenityCard; onDone: () => void }) {
  const [state, formAction] = useFormState<ActionState, FormData>(updateAmenityAction, {});
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      toast.success('Área actualizada.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <form action={formAction} className="mt-3 space-y-3 rounded-lg bg-canvas p-3">
      <input type="hidden" name="amenityId" value={amenity.id} />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="field-label">Nombre</label>
          <input name="name" defaultValue={amenity.name} className="field-input w-40" />
        </div>
        <div>
          <label className="field-label">Capacidad</label>
          <input name="capacity" type="number" defaultValue={amenity.capacity ?? ''} className="field-input w-20" />
        </div>
        <div>
          <label className="field-label">Costo</label>
          <input name="reservationCost" type="number" step="0.01" defaultValue={Number(amenity.reservationCost)} className="field-input w-24" />
        </div>
        <div>
          <label className="field-label">Máx. horas</label>
          <input name="maxHours" type="number" defaultValue={amenity.maxHours ?? ''} className="field-input w-20" />
        </div>
        <div>
          <label className="field-label">Días de anticipación</label>
          <input name="advanceDays" type="number" defaultValue={amenity.advanceDays} className="field-input w-24" />
        </div>
        <div>
          <label className="field-label">Estado</label>
          <select name="status" defaultValue={amenity.status} className="field-input">
            <option value="disponible">Disponible</option>
            <option value="mantenimiento">En mantenimiento</option>
            <option value="inhabilitada">Inhabilitada</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="field-label">Portada (reemplaza)</label>
          <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-44 text-xs" />
        </div>
        <div>
          <label className="field-label">Normativa (reemplaza)</label>
          <input name="rulesFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="field-input w-44 text-xs" />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-ink">
          <input type="checkbox" name="requiresApproval" defaultChecked={amenity.requiresApproval} /> Requiere aprobación
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-ink">
          <input type="checkbox" name="exclusivePerDay" defaultChecked={amenity.exclusivePerDay} /> Exclusiva por día
        </label>
      </div>
      <p className="text-[.68rem] leading-relaxed text-muted">
        <b>Exclusiva por día:</b> una reserva vigente —aprobada o pendiente de aprobación— bloquea el área todo el día.
        Sin esta opción, solo se bloquean las horas que se traslapan.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <UpdateButton />
        <button type="button" onClick={onDone} className="btn-ghost py-1.5 text-xs">
          Cancelar
        </button>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
          onClick={() => {
            if (!window.confirm(`¿Eliminar el área "${amenity.name}"?`)) return;
            enTransicion(startTransition, async () => {
              const r = await deleteAmenityAction(amenity.id);
              if (r.ok) toast.success('Área eliminada.');
              else toast.error(r.error);
            });
          }}
        >
          <CalendarX size={13} /> Eliminar área
        </button>
      </div>
      {state.formError && <p className="text-xs font-medium text-danger">{state.formError}</p>}
    </form>
  );
}

function UpdateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-1.5 text-xs">
      {pending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
}

export function AmenityCards({ amenities }: { amenities: AmenityCard[] }) {
  const [openSchedule, setOpenSchedule] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  if (amenities.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-3 gap-4 max-lg:grid-cols-2">
      {amenities.map((a) => (
        <div key={a.id} className="card overflow-hidden">
          {a.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={a.photoUrl} alt={a.name} className="h-32 w-full object-cover" />
          ) : (
            <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-royal/15 to-royal/5">
              <Waves className="text-royal/50" size={30} />
            </div>
          )}
          <div className="p-4">
            <p className="font-sans text-sm font-bold text-ink">{a.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {a.capacity ? `Capacidad ${a.capacity}` : 'Sin límite de capacidad'}
              {Number(a.reservationCost) > 0 && ` · Costo ${Number(a.reservationCost).toLocaleString('es-CR')}`}
              {a.requiresApproval && ' · requiere aprobación'}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              {a.rulesUrl && (
                <a href={a.rulesUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-royal hover:underline">
                  <FileText size={12} /> Normativa
                </a>
              )}
              <button
                type="button"
                onClick={() => setOpenSchedule(openSchedule === a.id ? null : a.id)}
                className="inline-flex items-center gap-1 font-semibold text-royal hover:underline"
              >
                <Clock size={12} /> {openSchedule === a.id ? 'Cerrar horario' : `Horario (${a.schedules.length})`}
              </button>
              <button
                type="button"
                onClick={() => setEditing(editing === a.id ? null : a.id)}
                className="inline-flex items-center gap-1 font-semibold text-royal hover:underline"
              >
                <Pencil size={12} /> {editing === a.id ? 'Cerrar' : 'Configurar'}
              </button>
            </div>
            {a.exclusivePerDay && (
              <p className="mt-1 text-[.66rem] text-muted">Se reserva por día completo</p>
            )}
            {editing === a.id && <AmenityEditor amenity={a} onDone={() => setEditing(null)} />}
            {openSchedule === a.id && <ScheduleEditor amenity={a} />}
          </div>
        </div>
      ))}
    </div>
  );
}
