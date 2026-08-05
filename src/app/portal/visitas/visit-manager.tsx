'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Plus, QrCode, MessageCircle, PauseCircle, PlayCircle, XCircle, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui/status-chip';
import { authorizeVisitAction, setMyVisitStatusAction, type ActionState } from './actions';

export type PortalVisit = {
  id: string;
  visitType: string;
  visitorName: string;
  visitorIdNumber: string | null;
  vehiclePlate: string | null;
  courier: string | null;
  relation: string | null;
  photoUrl: string | null;
  code: string;
  validDate: string | null;
  arrivalTime: string | null;
  endDate: string | null;
  schedules: { dayOfWeek: number; startsAt: string; endsAt: string }[];
  estado:
    | 'Autorizada'
    | 'Dentro del condominio'
    | 'Finalizada'
    | 'Vencida'
    | 'Suspendida'
    | 'Cancelada'
    | 'Programado';
  isToday: boolean;
  qrDataUrl: string | null;
};

type Alert = { id: string; kind: string; text: string; when: string };

const TYPE_LABEL: Record<string, string> = { entrega: 'Entrega', rapida: 'Visita rápida', recurrente: 'Recurrente', empleado: 'Empleado' };
const ESTADO_VARIANT: Record<PortalVisit['estado'], 'ok' | 'royal' | 'neutral' | 'danger' | 'warn'> = {
  Autorizada: 'ok',
  'Dentro del condominio': 'royal',
  Finalizada: 'neutral',
  Vencida: 'danger',
  Suspendida: 'warn',
  Cancelada: 'danger',
  Programado: 'warn',
};
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const TABS = ['Hoy', 'Activas', 'Recurrentes', 'Empleados', 'Historial'] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Guardando…' : 'Autorizar'}
    </button>
  );
}

/** Formulario dinámico según el tipo de visita. */
function NewVisitForm() {
  const [type, setType] = useState('rapida');
  const [state, formAction] = useFormState<ActionState, FormData>(authorizeVisitAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;

  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      toast.success('Autorización creada.');
    }
  }, [state.success]);

  const permanent = type === 'recurrente' || type === 'empleado';

  return (
    <form ref={ref} action={formAction} className="card p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Plus size={13} /> Nueva visita
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Tipo</label>
          <select name="visitType" value={type} onChange={(e) => setType(e.target.value)} className="field-input">
            <option value="entrega">Entrega</option>
            <option value="rapida">Visita rápida</option>
            <option value="recurrente">Visita recurrente</option>
            <option value="empleado">Empleado</option>
          </select>
        </div>
        <div>
          <label className="field-label">{type === 'entrega' ? 'Nombre del repartidor' : 'Nombre completo'}</label>
          <input name="visitorName" className="field-input w-48" />
        </div>
        {type === 'entrega' && (
          <div>
            <label className="field-label">Empresa</label>
            <input name="courier" placeholder="Correos, Uber, DHL…" className="field-input w-36" />
          </div>
        )}
        {type !== 'entrega' && (
          <div>
            <label className="field-label">Identificación{type === 'empleado' ? '' : ' (opcional)'}</label>
            <input name="visitorIdNumber" className="field-input w-32" />
          </div>
        )}
        <div>
          <label className="field-label">Placa (opcional)</label>
          <input name="vehiclePlate" className="field-input w-28" />
        </div>

        {(type === 'rapida' || type === 'entrega') && (
          <>
            <div>
              <label className="field-label">Fecha (hoy por defecto)</label>
              <input name="validDate" type="date" defaultValue={todayStr} min={todayStr} className="field-input" />
            </div>
            {type === 'rapida' && (
              <div>
                <label className="field-label">Hora estimada</label>
                <input name="arrivalTime" type="time" className="field-input w-28" />
              </div>
            )}
          </>
        )}

        {type === 'empleado' && (
          <>
            <div>
              <label className="field-label">Teléfono</label>
              <input name="phone" className="field-input w-32" />
            </div>
            <div>
              <label className="field-label">Empresa (opcional)</label>
              <input name="courier" className="field-input w-36" />
            </div>
            <div>
              <label className="field-label">Fecha de trabajo (si no es recurrente)</label>
              <input name="validDate" type="date" min={todayStr} className="field-input" />
            </div>
          </>
        )}

        {permanent && (
          <>
            <div className="w-full rounded-lg bg-canvas p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                Días y horario permitidos {type === 'empleado' ? '(obligatorio)' : '(opcional — vacío = siempre)'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_SHORT.map((d, i) => (
                  <label
                    key={d}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink has-[:checked]:border-royal has-[:checked]:bg-royal-soft has-[:checked]:text-royal"
                  >
                    <input type="checkbox" name="allowedDays" value={i} className="sr-only" />
                    {d}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex items-end gap-3">
                <div>
                  <label className="field-label">Desde</label>
                  <input name="allowedFrom" type="time" className="field-input w-28" />
                </div>
                <div>
                  <label className="field-label">Hasta</label>
                  <input name="allowedUntil" type="time" className="field-input w-28" />
                </div>
                <div>
                  <label className="field-label">Vence (opcional)</label>
                  <input name="endDate" type="date" min={todayStr} className="field-input" />
                </div>
              </div>
            </div>
            <div>
              <label className="field-label">
                Fotografía {type === 'empleado' ? '(obligatoria)' : '(opcional)'}
              </label>
              <input name="photo" type="file" accept=".jpg,.jpeg,.png,.webp" className="field-input w-56 text-xs" />
            </div>
            <div>
              <label className="field-label">{type === 'empleado' ? 'Residente responsable / puesto' : 'Motivo / relación'}</label>
              <input name="relation" placeholder={type === 'empleado' ? 'Ej: limpieza, jardinero' : 'Ej: madre, entrenador'} className="field-input w-44" />
            </div>
          </>
        )}

        <div className="w-full">
          <label className="field-label">Observaciones (opcional)</label>
          <input name="notes" className="field-input" />
        </div>
        <SubmitButton />
      </div>
      {state.formError && <p className="mt-2 text-xs font-medium text-danger">{state.formError}</p>}
      {state.errors &&
        Object.values(state.errors).map((msgs, i) => (
          <p key={i} className="mt-1 text-xs font-medium text-danger">
            {msgs?.[0]}
          </p>
        ))}
    </form>
  );
}

function VisitCard({ visit, condoName }: { visit: PortalVisit; condoName: string }) {
  const [showQr, setShowQr] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = !['Cancelada', 'Vencida', 'Finalizada'].includes(visit.estado);
  const canSuspend = (visit.visitType === 'recurrente' || visit.visitType === 'empleado') && visit.estado !== 'Cancelada' && visit.estado !== 'Vencida';

  const waText = encodeURIComponent(
    `Autorización de visita — ${condoName}\n${TYPE_LABEL[visit.visitType]}: ${visit.visitorName}\nCódigo de acceso: ${visit.code}\n${visit.validDate ? `Fecha: ${visit.validDate}` : 'Vigente'}${visit.arrivalTime ? ` · ${visit.arrivalTime}` : ''}\nPreséntalo en la caseta de seguridad.`
  );

  const setStatus = (status: 'cancelada' | 'suspendida' | 'vigente', confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    startTransition(async () => {
      const r = await setMyVisitStatusAction(visit.id, status);
      if (r.ok) toast.success('Autorización actualizada.');
      else toast.error(r.error);
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        {visit.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visit.photoUrl} alt={visit.visitorName} className="h-11 w-11 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-royal-soft text-sm font-bold text-royal">
            {visit.visitorName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {visit.visitorName}
            <span className="ml-2 text-xs text-muted">{TYPE_LABEL[visit.visitType]}</span>
          </p>
          <p className="text-xs text-muted">
            Código <b className="font-mono">{visit.code}</b>
            {visit.visitorIdNumber && ` · Cédula ${visit.visitorIdNumber}`}
            {visit.vehiclePlate && ` · Placa ${visit.vehiclePlate}`}
            {visit.courier && ` · ${visit.courier}`}
            {visit.validDate && ` · ${visit.validDate}`}
            {visit.endDate && ` · vence ${visit.endDate}`}
          </p>
          {visit.schedules.length > 0 && (
            <p className="text-[.68rem] text-muted">
              {visit.schedules.map((s) => `${DAYS_SHORT[s.dayOfWeek]} ${s.startsAt}–${s.endsAt}`).join(' · ')}
            </p>
          )}
        </div>
        <StatusChip variant={ESTADO_VARIANT[visit.estado]}>{visit.estado}</StatusChip>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 pl-14 text-xs">
        {visit.qrDataUrl && (
          <button type="button" onClick={() => setShowQr((v) => !v)} className="inline-flex items-center gap-1 font-semibold text-royal hover:underline">
            <QrCode size={13} /> {showQr ? 'Ocultar QR' : 'Código QR'}
          </button>
        )}
        {active && (
          <a
            href={`https://wa.me/?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-ok hover:underline"
          >
            <MessageCircle size={13} /> Compartir por WhatsApp
          </a>
        )}
        {canSuspend && visit.estado !== 'Suspendida' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus('suspendida', `¿Suspender la autorización de ${visit.visitorName}? Seguridad bloqueará su ingreso hasta que la reactives.`)}
            className="inline-flex items-center gap-1 font-semibold text-warn hover:underline"
          >
            <PauseCircle size={13} /> Suspender
          </button>
        )}
        {canSuspend && visit.estado === 'Suspendida' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus('vigente', `¿Reactivar la autorización de ${visit.visitorName}?`)}
            className="inline-flex items-center gap-1 font-semibold text-ok hover:underline"
          >
            <PlayCircle size={13} /> Reactivar
          </button>
        )}
        {active && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus('cancelada', `¿Cancelar la autorización de ${visit.visitorName}? Esta acción no se puede deshacer.`)}
            className="inline-flex items-center gap-1 font-semibold text-danger hover:underline"
          >
            <XCircle size={13} /> Cancelar
          </button>
        )}
      </div>

      {showQr && visit.qrDataUrl && (
        <div className="mt-3 flex items-center gap-4 pl-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visit.qrDataUrl} alt={`QR ${visit.code}`} className="h-36 w-36 rounded-lg border border-line" />
          <p className="max-w-56 text-xs text-muted">
            Tu visita presenta este código (o el texto <b className="font-mono">{visit.code}</b>) en la caseta de seguridad.
          </p>
        </div>
      )}
    </div>
  );
}

export function VisitManager({ visits, alerts, condoName }: { visits: PortalVisit[]; alerts: Alert[]; condoName: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Hoy');

  const filtered = visits.filter((v) => {
    if (tab === 'Hoy') return (v.isToday || v.visitType === 'recurrente') && !['Cancelada', 'Vencida', 'Finalizada'].includes(v.estado);
    if (tab === 'Activas') return !['Cancelada', 'Vencida', 'Finalizada'].includes(v.estado);
    if (tab === 'Recurrentes') return v.visitType === 'recurrente';
    if (tab === 'Empleados') return v.visitType === 'empleado';
    return ['Cancelada', 'Vencida', 'Finalizada'].includes(v.estado); // Historial
  });

  return (
    <div>
      {alerts.length > 0 && (
        <div className="card mb-4 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
            <Bell size={13} /> Avisos recientes
          </p>
          <ul className="space-y-1">
            {alerts.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-1.5 w-1.5 flex-none rounded-full ${
                    a.kind === 'fuera_horario' ? 'bg-danger' : a.kind === 'por_vencer' ? 'bg-warn' : a.kind === 'salio' ? 'bg-muted' : 'bg-royal'
                  }`}
                />
                <span className="text-ink">{a.text}</span>
                <span className="ml-auto flex-none text-muted">
                  {new Date(a.when).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NewVisitForm />

      <div className="mt-5 flex gap-1 rounded-xl bg-canvas p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition ${
              tab === t ? 'bg-white text-royal shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="card mt-3 divide-y divide-line">
        {filtered.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">Sin visitas en esta vista.</p>
        ) : (
          filtered.map((v) => <VisitCard key={v.id} visit={v} condoName={condoName} />)
        )}
      </div>
    </div>
  );
}
