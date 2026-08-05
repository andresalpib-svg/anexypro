'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Package, Zap, Repeat, HardHat, Search, LogIn, LogOut, Camera, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  createVisitAction,
  securityCheckInAction,
  securityCheckInWithEvidenceAction,
  securityCheckOutAction,
  type ActionState,
} from './actions';

export type CasetaVisit = {
  id: string;
  visitType: string;
  visitorName: string;
  visitorIdNumber: string | null;
  vehiclePlate: string | null;
  courier: string | null;
  photoUrl: string | null;
  propertyCode: string;
  code: string;
  schedules: { dayOfWeek: number; startsAt: string; endsAt: string }[];
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'azul' | 'neutro';
  estadoText: string;
  canEnter: boolean;
  requiresOverride: boolean;
  inside: boolean;
  openCheckinId: string | null;
  checkinAt: string | null;
};

const TYPE_META = {
  entrega: { label: 'Entregas', icon: Package },
  rapida: { label: 'Visitas rápidas', icon: Zap },
  recurrente: { label: 'Recurrentes', icon: Repeat },
  empleado: { label: 'Empleados', icon: HardHat },
} as const;

const SEMAFORO_CLASS: Record<CasetaVisit['semaforo'], string> = {
  verde: 'border-l-4 border-l-ok bg-ok-bg/30',
  amarillo: 'border-l-4 border-l-warn bg-warn-bg/30',
  rojo: 'border-l-4 border-l-danger bg-danger-bg/30',
  azul: 'border-l-4 border-l-royal bg-royal-soft/40',
  neutro: 'border-l-4 border-l-line',
};
const SEMAFORO_TEXT: Record<CasetaVisit['semaforo'], string> = {
  verde: 'text-ok',
  amarillo: 'text-warn',
  rojo: 'text-danger',
  azul: 'text-royal',
  neutro: 'text-muted',
};
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function minutesSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

function EvidenceForm({ visit, onDone }: { visit: CasetaVisit; onDone: () => void }) {
  const [state, formAction] = useFormState<ActionState, FormData>(securityCheckInWithEvidenceAction, {});
  useEffect(() => {
    if (state.success) {
      toast.success('Ingreso registrado con evidencia.');
      onDone();
    }
  }, [state.success, onDone]);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-white p-3">
      <input type="hidden" name="authorizationId" value={visit.id} />
      {visit.requiresOverride && <input type="hidden" name="override" value="true" />}
      <div>
        <label className="field-label">Fotografía de evidencia</label>
        <input name="evidence" type="file" accept=".jpg,.jpeg,.png,.webp" capture="environment" className="field-input w-56 text-xs" />
      </div>
      <div className="min-w-40 flex-1">
        <label className="field-label">Observaciones</label>
        <input name="notes" className="field-input py-2 text-sm" />
      </div>
      <EvidenceSubmit />
      {state.formError && <p className="w-full text-xs font-medium text-danger">{state.formError}</p>}
    </form>
  );
}

function EvidenceSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-sm">
      {pending ? 'Registrando…' : 'Registrar ingreso'}
    </button>
  );
}

function VisitRow({ visit }: { visit: CasetaVisit }) {
  const [pending, startTransition] = useTransition();
  const [showEvidence, setShowEvidence] = useState(false);

  const doCheckIn = (override = false) =>
    startTransition(async () => {
      const r = await securityCheckInAction(visit.id, override);
      if (r.ok) {
        toast.success(`Ingreso registrado: ${visit.visitorName}`);
        return;
      }
      if (r.requiresOverride && !override) {
        if (
          window.confirm(
            `⛔ ${r.error}\n\n¿Cuenta con la aprobación del residente o de la administración para permitir el ingreso FUERA DE HORARIO? La aprobación manual queda registrada en auditoría.`
          )
        ) {
          doCheckIn(true);
        }
        return;
      }
      toast.error(r.error);
    });

  const doCheckOut = () =>
    startTransition(async () => {
      const r = await securityCheckOutAction(visit.openCheckinId!);
      if (r.ok) toast.success(`Salida registrada: ${visit.visitorName}`);
      else toast.error(r.error);
    });

  return (
    <div className={`rounded-xl p-3 ${SEMAFORO_CLASS[visit.semaforo]}`}>
      <div className="flex items-center gap-3">
        {visit.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={visit.photoUrl} alt={visit.visitorName} className="h-12 w-12 flex-none rounded-full object-cover" />
        ) : (
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white text-base font-bold text-royal">
            {visit.visitorName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">
            {visit.visitorName}
            <span className="ml-2 text-sm font-normal text-muted">{visit.propertyCode}</span>
          </p>
          <p className="truncate text-xs text-muted">
            <b className="font-mono">{visit.code}</b>
            {visit.visitorIdNumber && ` · ${visit.visitorIdNumber}`}
            {visit.vehiclePlate && ` · ${visit.vehiclePlate}`}
            {visit.courier && ` · ${visit.courier}`}
            {visit.schedules.length > 0 &&
              ` · ${visit.schedules.map((s) => `${DAYS_SHORT[s.dayOfWeek]} ${s.startsAt}–${s.endsAt}`).join(', ')}`}
          </p>
          <p className={`truncate text-xs font-bold ${SEMAFORO_TEXT[visit.semaforo]}`}>
            {visit.estadoText}
            {visit.inside && visit.checkinAt && ` · ${minutesSince(visit.checkinAt)} min`}
          </p>
        </div>

        {visit.inside ? (
          <button
            type="button"
            disabled={pending}
            onClick={doCheckOut}
            className="flex h-12 flex-none items-center gap-2 rounded-xl bg-royal px-5 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50"
          >
            <LogOut size={18} /> SALIDA
          </button>
        ) : visit.canEnter || visit.requiresOverride ? (
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              title="Ingreso con evidencia fotográfica"
              onClick={() => setShowEvidence((v) => !v)}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-white text-muted transition hover:text-royal"
            >
              <Camera size={18} />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => doCheckIn(false)}
              className={`flex h-12 flex-none items-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:opacity-50 ${
                visit.requiresOverride ? 'bg-danger' : 'bg-ok'
              }`}
            >
              <LogIn size={18} /> INGRESO
            </button>
          </div>
        ) : null}
      </div>
      {showEvidence && !visit.inside && <EvidenceForm visit={visit} onDone={() => setShowEvidence(false)} />}
    </div>
  );
}

function QuickCreate({ condominiumId, properties }: { condominiumId: string; properties: { id: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<ActionState, FormData>(createVisitAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      ref.current?.reset();
      setOpen(false);
      toast.success('Visita registrada.');
    }
  }, [state.success]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost py-2 text-sm">
        <Plus size={15} /> Registrar visita sin autorización previa
      </button>
    );
  }
  return (
    <form ref={ref} action={formAction} className="card flex w-full flex-wrap items-end gap-3 p-4">
      <input type="hidden" name="condominiumId" value={condominiumId} />
      <div>
        <label className="field-label">Tipo</label>
        <select name="visitType" className="field-input">
          <option value="entrega">Entrega</option>
          <option value="rapida">Visita rápida</option>
        </select>
      </div>
      <div>
        <label className="field-label">Nombre</label>
        <input name="visitorName" className="field-input w-44" />
      </div>
      <div>
        <label className="field-label">Unidad</label>
        <select name="propertyId" className="field-input">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label">Empresa (entregas)</label>
        <input name="courier" className="field-input w-32" />
      </div>
      <div>
        <label className="field-label">Placa</label>
        <input name="vehiclePlate" className="field-input w-24" />
      </div>
      <QuickCreateSubmit />
      <button type="button" onClick={() => setOpen(false)} className="btn-ghost py-2 text-xs">
        Cancelar
      </button>
      {state.formError && <p className="w-full text-xs text-danger">{state.formError}</p>}
      {state.errors?.visitorName && <p className="w-full text-xs text-danger">{state.errors.visitorName[0]}</p>}
    </form>
  );
}

function QuickCreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary py-2 text-sm">
      {pending ? 'Registrando…' : 'Registrar'}
    </button>
  );
}

export function Caseta({
  visits,
  properties,
  condominiumId,
}: {
  visits: CasetaVisit[];
  properties: { id: string; code: string }[];
  condominiumId: string;
}) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const counts = (type: string) => {
    const of = visits.filter((v) => v.visitType === type);
    return {
      pendientes: of.filter((v) => v.semaforo === 'verde' || v.semaforo === 'amarillo').length,
      dentro: of.filter((v) => v.inside).length,
      bloqueadas: of.filter((v) => v.semaforo === 'rojo').length,
    };
  };

  const q = query.trim().toLowerCase();
  const filtered = visits
    .filter((v) => (typeFilter ? v.visitType === typeFilter : true))
    .filter((v) =>
      q
        ? `${v.visitorName} ${v.visitorIdNumber ?? ''} ${v.vehiclePlate ?? ''} ${v.code} ${v.propertyCode}`.toLowerCase().includes(q)
        : true
    )
    // Relevantes primero: dentro → autorizadas → bloqueadas → resto.
    .sort((a, b) => {
      const rank = (v: CasetaVisit) => (v.inside ? 0 : v.semaforo === 'verde' ? 1 : v.semaforo === 'rojo' ? 2 : v.semaforo === 'amarillo' ? 3 : 4);
      return rank(a) - rank(b);
    })
    .slice(0, 40);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        {(Object.keys(TYPE_META) as (keyof typeof TYPE_META)[]).map((type) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const c = counts(type);
          const active = typeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(active ? null : type)}
              className={`card p-4 text-left transition ${active ? 'ring-2 ring-royal' : 'hover:-translate-y-0.5'}`}
            >
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                <Icon size={15} /> {meta.label}
              </p>
              <div className="mt-2 flex items-center gap-3 text-xs font-semibold">
                <span className="text-ok">{c.pendientes} por ingresar</span>
                <span className="text-royal">{c.dentro} dentro</span>
                {c.bloqueadas > 0 && <span className="text-danger">{c.bloqueadas} bloqueada(s)</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative mt-3">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, cédula, placa, código QR o casa…"
          className="field-input py-3 pl-10 text-base"
          autoFocus
        />
      </div>

      <div className="mt-3">
        <QuickCreate condominiumId={condominiumId} properties={properties} />
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="card p-10 text-center text-sm text-muted">Sin visitas en esta vista.</p>
        ) : (
          filtered.map((v) => <VisitRow key={v.id} visit={v} />)
        )}
      </div>
    </div>
  );
}
