import crypto from 'crypto';
import { withTenantContext } from '@/lib/db';
import { getPropertySuspension } from '@/lib/services/finance';
import { logActivity } from '@/lib/services/audit';

/**
 * Módulo de Visitas y Control de Acceso — 4 tipos:
 *   entrega    → ingreso inmediato, permanencia máxima configurable
 *   rapida     → vigencia de UN día (vence a las 23:59 del día autorizado)
 *   recurrente → ingreso automático dentro de días/horario permitidos
 *   empleado   → SOLO dentro del horario autorizado; fuera de él,
 *                alerta roja + aprobación manual (override auditado)
 *
 * El estado en base es VisitStatus (vigente/usada/vencida/cancelada/
 * suspendida); los estados finos de la especificación ("dentro",
 * "finalizada", "fuera de horario") se DERIVAN de los check-ins y la
 * hora actual — una sola fuente de verdad, sin estados duplicados.
 */

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DELIVERY_MAX_STAY_MINUTES = 60;

function genCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
}

const p2 = (n: number) => String(n).padStart(2, '0');
/** Día calendario local "YYYY-MM-DD". */
function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
}
const dateOnly = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
function nowHHMM(): string {
  const now = new Date();
  return `${p2(now.getHours())}:${p2(now.getMinutes())}`;
}

export type VisitInput = {
  condominiumId: string;
  propertyId: string;
  visitType: 'rapida' | 'recurrente' | 'entrega' | 'empleado';
  visitorName: string;
  visitorIdNumber?: string;
  vehiclePlate?: string;
  courier?: string; // empresa
  phone?: string;
  relation?: string;
  visitorPhotoUrl?: string;
  validDate?: Date; // rápida/entrega/empleado (fecha de trabajo)
  arrivalTime?: string;
  startDate?: Date;
  endDate?: Date;
  allowedDays?: number[]; // 0=domingo … 6=sábado
  allowedFrom?: string; // "HH:mm"
  allowedUntil?: string;
  notes?: string;
};

export async function createVisit(
  companyId: string,
  userId: string,
  userName: string,
  isOfficer: boolean,
  input: VisitInput
) {
  // Seguridad NO crea recurrentes ni empleados — solo el residente o
  // la administración definen autorizaciones permanentes y horarios.
  if (isOfficer && (input.visitType === 'recurrente' || input.visitType === 'empleado')) {
    throw new Error('El personal de seguridad no puede crear visitas recurrentes ni empleados — solo el residente o la administración.');
  }

  if (!isOfficer) {
    const suspension = await getPropertySuspension(companyId, input.propertyId);
    if (suspension.suspended) {
      throw new Error(
        `Tu unidad tiene los servicios condominales suspendidos por ${suspension.monthsOverdue} meses de atraso — no puedes autorizar visitas hasta ponerte al día.`
      );
    }
  }

  // ---- Validaciones por tipo ----
  const today = todayStr();
  if (input.visitType === 'rapida' || input.visitType === 'entrega') {
    // Fecha automática al día en curso si no se indica.
    if (!input.validDate) input.validDate = new Date(`${today}T12:00:00`);
    if (dateOnly(input.validDate)! < today) throw new Error('La fecha de la visita no puede ser un día pasado.');
  }
  if (input.visitType === 'empleado') {
    if (!input.visitorIdNumber) throw new Error('La identificación del empleado es obligatoria.');
    if (!input.visitorPhotoUrl) throw new Error('La fotografía del empleado es obligatoria.');
    if (!input.allowedFrom || !input.allowedUntil) throw new Error('Indica el horario autorizado de entrada y salida.');
    if (!input.validDate && (!input.allowedDays || input.allowedDays.length === 0)) {
      throw new Error('Indica la fecha de trabajo o los días recurrentes del empleado.');
    }
    if (input.validDate && dateOnly(input.validDate)! < today) throw new Error('La fecha de trabajo no puede ser un día pasado.');
  }
  if (input.visitType === 'recurrente') {
    if (input.endDate && dateOnly(input.endDate)! < today) throw new Error('La fecha de vencimiento no puede ser pasada.');
  }
  if (input.allowedFrom && input.allowedUntil && input.allowedUntil <= input.allowedFrom) {
    throw new Error('El horario permitido es inválido: la hora final debe ser mayor que la inicial.');
  }

  return withTenantContext(companyId, async (tx) => {
    // Sin duplicados ACTIVOS con la misma identificación o placa en la
    // misma unidad.
    if (input.visitorIdNumber || input.vehiclePlate) {
      const dup = await tx.visitAuthorization.findFirst({
        where: {
          propertyId: input.propertyId,
          status: { in: ['vigente', 'suspendida'] },
          OR: [
            ...(input.visitorIdNumber ? [{ visitorIdNumber: input.visitorIdNumber }] : []),
            ...(input.vehiclePlate ? [{ vehiclePlate: { equals: input.vehiclePlate, mode: 'insensitive' as const } }] : []),
          ],
        },
      });
      if (dup) {
        throw new Error(
          `Ya existe una autorización activa con esa identificación o placa (${dup.visitorName}). Cancélala antes de crear otra.`
        );
      }
    }

    const property = await tx.property.findUniqueOrThrow({ where: { id: input.propertyId }, select: { code: true } });
    const visit = await tx.visitAuthorization.create({
      data: {
        condominiumId: input.condominiumId,
        propertyId: input.propertyId,
        visitType: input.visitType,
        visitorName: input.visitorName,
        visitorIdNumber: input.visitorIdNumber || null,
        vehiclePlate: input.vehiclePlate?.toUpperCase() || null,
        courier: input.courier || null,
        phone: input.phone || null,
        relation: input.relation || null,
        visitorPhotoUrl: input.visitorPhotoUrl || null,
        code: genCode(),
        validDate: input.validDate ?? null,
        arrivalTime: input.arrivalTime || null,
        startDate:
          input.startDate ??
          (input.visitType === 'recurrente' || input.visitType === 'empleado' ? new Date(`${today}T12:00:00`) : null),
        endDate: input.endDate ?? null,
        notes: input.notes || null,
        createdById: userId,
        createdByRole: isOfficer ? 'seguridad' : null,
        schedules:
          input.allowedDays && input.allowedDays.length > 0 && input.allowedFrom && input.allowedUntil
            ? { create: input.allowedDays.map((d) => ({ dayOfWeek: d, startsAt: input.allowedFrom!, endsAt: input.allowedUntil! })) }
            : input.allowedFrom && input.allowedUntil && input.visitType === 'empleado' && input.validDate
              ? { create: [{ dayOfWeek: new Date(input.validDate).getUTCDay(), startsAt: input.allowedFrom, endsAt: input.allowedUntil }] }
              : undefined,
      },
      include: { schedules: true },
    });

    await logActivity(tx, companyId, {
      userId,
      userName,
      module: 'Visitas',
      action: isOfficer
        ? 'Visita creada por oficial (sin autorización previa del residente)'
        : `Autorización creada (${input.visitType})`,
      target: `${input.visitorName} · ${property.code}`,
    });
    return visit;
  });
}

/**
 * Barrido perezoso de vencimientos — se ejecuta al listar:
 *  - rápidas/entregas/empleados de un día: vencen pasadas las 23:59.
 *  - recurrentes/empleados con endDate: vencen al superar la fecha.
 */
/**
 * Condominios ya barridos hoy en este proceso.
 *
 * El barrido son dos UPDATE que corren en CADA listado de visitas, y la
 * caseta se refresca cada 10 segundos: después de la primera pasada del
 * día no hay nada que marcar, así que eran miles de escrituras diarias
 * que afectaban cero filas —con su bloqueo y su coste de mantenimiento
 * de tabla— solo para confirmar que no había trabajo.
 *
 * Se recuerda por condominio y día. Si el proceso se recicla se vuelve
 * a barrer, que es inofensivo: la operación es idempotente.
 */
const barridoHecho = new Map<string, string>();

async function expireSweep(tx: any, condominiumId: string) {
  const hoy = todayStr();
  if (barridoHecho.get(condominiumId) === hoy) return;

  const limit = new Date(`${hoy}T00:00:00Z`);
  await tx.visitAuthorization.updateMany({
    where: { condominiumId, status: 'vigente', visitType: { in: ['rapida', 'entrega'] }, validDate: { not: null, lt: limit } },
    data: { status: 'vencida' },
  });
  await tx.visitAuthorization.updateMany({
    where: { condominiumId, status: { in: ['vigente', 'suspendida'] }, endDate: { not: null, lt: limit } },
    data: { status: 'vencida' },
  });

  barridoHecho.set(condominiumId, hoy);
}

const FULL_INCLUDE = {
  property: { select: { id: true, code: true } },
  schedules: true,
  checkins: { orderBy: { checkinAt: 'asc' as const } },
};

/**
 * Tope de autorizaciones que se traen para las pantallas de visitas.
 *
 * Estas listas no tenían límite. Un condominio de 400 unidades genera
 * unas 15.000 autorizaciones al año, y cada una arrastra sus horarios y
 * todos sus ingresos: la caseta —que se refresca cada 10 segundos—
 * acababa moviendo el historial completo en cada vuelta. Las pantallas
 * muestran lo reciente y buscan sobre ello; el histórico completo es
 * trabajo de Reportes.
 *
 * El índice `[condominiumId, createdAt desc]` ya existe, así que con el
 * tope esto es una lectura de las primeras N filas del índice.
 */
const MAX_VISITAS = 300;

export async function listVisits(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    await expireSweep(tx, condominiumId);
    return tx.visitAuthorization.findMany({
      where: { condominiumId },
      orderBy: { createdAt: 'desc' },
      include: FULL_INCLUDE,
      take: MAX_VISITAS,
    });
  });
}

export async function listVisitsByProperty(companyId: string, propertyId: string) {
  return withTenantContext(companyId, async (tx) => {
    const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId }, select: { condominiumId: true } });
    await expireSweep(tx, property.condominiumId);
    return tx.visitAuthorization.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
      include: FULL_INCLUDE,
      take: MAX_VISITAS,
    });
  });
}

// ---------- Estado derivado ----------
export type DerivedVisit = Awaited<ReturnType<typeof listVisits>>[number];
export type VisitaDeFilial = Awaited<ReturnType<typeof listVisitsByProperty>>[number];

export type AccessDecision =
  | { allowed: true; automatic: boolean; label: string }
  | { allowed: false; requiresOverride: boolean; reason: string };

export function isInside(v: { checkins: { checkoutAt: Date | null }[] }): boolean {
  const last = v.checkins[v.checkins.length - 1];
  return Boolean(last && !last.checkoutAt);
}

export function hasFinished(v: { checkins: { checkoutAt: Date | null }[] }): boolean {
  const last = v.checkins[v.checkins.length - 1];
  return Boolean(last && last.checkoutAt);
}

/** ¿Puede ingresar AHORA? — reglas por tipo, evaluadas a la hora actual. */
export function accessDecision(v: DerivedVisit): AccessDecision {
  if (v.status === 'cancelada') return { allowed: false, requiresOverride: false, reason: 'Autorización cancelada.' };
  if (v.status === 'suspendida')
    return { allowed: false, requiresOverride: false, reason: 'Autorización SUSPENDIDA por el residente o la administración.' };
  if (v.status === 'vencida') return { allowed: false, requiresOverride: false, reason: 'Autorización vencida.' };
  if (isInside(v)) return { allowed: false, requiresOverride: false, reason: 'Ya está dentro del condominio.' };

  const today = todayStr();
  const now = nowHHMM();

  if (v.visitType === 'entrega') {
    if (v.status === 'usada' && hasFinished(v)) return { allowed: false, requiresOverride: false, reason: 'Entrega finalizada.' };
    return { allowed: true, automatic: true, label: 'Entrega — ingreso inmediato' };
  }

  if (v.visitType === 'rapida') {
    if (v.status === 'usada' && hasFinished(v))
      return { allowed: false, requiresOverride: false, reason: 'Visita finalizada (un ingreso por día autorizado).' };
    const valid = dateOnly(v.validDate);
    if (valid !== today) {
      return {
        allowed: false,
        requiresOverride: false,
        reason: valid && valid < today ? 'La autorización venció (era para otro día).' : `Autorizada para el ${valid} — hoy no puede ingresar.`,
      };
    }
    return { allowed: true, automatic: false, label: 'Autorizada para hoy' };
  }

  // recurrente / empleado: días + horario
  const dow = new Date().getDay();
  const blocks = v.schedules.filter((s) => s.dayOfWeek === dow);
  const anySchedules = v.schedules.length > 0;
  const requiresOverride = v.visitType === 'empleado';

  if (v.visitType === 'empleado' && v.validDate && dateOnly(v.validDate) !== today && !anySchedules) {
    return { allowed: false, requiresOverride: false, reason: `Programado para el ${dateOnly(v.validDate)}.` };
  }
  if (anySchedules && blocks.length === 0) {
    return { allowed: false, requiresOverride, reason: `Hoy (${DAYS_ES[dow]}) no está en sus días permitidos.` };
  }
  if (blocks.length > 0 && !blocks.some((b) => now >= b.startsAt && now <= b.endsAt)) {
    const horario = blocks.map((b) => `${b.startsAt}–${b.endsAt}`).join(', ');
    return {
      allowed: false,
      requiresOverride,
      reason: `FUERA DE HORARIO — su horario de hoy es ${horario} (ahora son las ${now}).`,
    };
  }
  return {
    allowed: true,
    automatic: v.visitType === 'recurrente',
    label: v.visitType === 'recurrente' ? 'Ingreso automático autorizado' : 'Dentro del horario autorizado',
  };
}

/** Entrega con permanencia excedida (para alertas de caseta). */
export function deliveryOverstayed(v: DerivedVisit): boolean {
  if (v.visitType !== 'entrega' || !isInside(v)) return false;
  const last = v.checkins[v.checkins.length - 1]!;
  return Date.now() - new Date(last.checkinAt).getTime() > DELIVERY_MAX_STAY_MINUTES * 60000;
}

// ---------- Ingreso / salida ----------
export async function checkIn(
  companyId: string,
  authorizationId: string,
  officer: { userId: string; userName: string },
  opts?: { override?: boolean; evidencePhotoUrl?: string; notes?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const auth = await tx.visitAuthorization.findUniqueOrThrow({ where: { id: authorizationId }, include: FULL_INCLUDE });
    const decision = accessDecision(auth as DerivedVisit);
    if (!decision.allowed && !(decision.requiresOverride && opts?.override)) {
      throw new Error(decision.reason);
    }

    await tx.visitCheckin.create({
      data: {
        authorizationId,
        registeredById: officer.userId,
        overrideOutOfSchedule: Boolean(!decision.allowed && opts?.override),
        photoUrl: opts?.evidencePhotoUrl || null,
        notes: opts?.notes || null,
      },
    });
    if (auth.visitType === 'rapida' || auth.visitType === 'entrega') {
      await tx.visitAuthorization.update({ where: { id: authorizationId }, data: { status: 'usada' } });
    }
    await logActivity(tx, companyId, {
      userId: officer.userId,
      userName: officer.userName,
      module: 'Visitas',
      action: !decision.allowed && opts?.override ? 'INGRESO FUERA DE HORARIO (aprobación manual)' : 'Ingreso registrado',
      target: `${auth.visitorName} (${auth.visitType}) · ${auth.property.code}`,
    });
  });
}

export async function checkOut(companyId: string, checkinId: string, officer?: { userId: string; userName: string }) {
  return withTenantContext(companyId, async (tx) => {
    const checkin = await tx.visitCheckin.update({
      where: { id: checkinId },
      data: { checkoutAt: new Date(), checkoutById: officer?.userId ?? null },
      include: { authorization: { include: { property: { select: { code: true } } } } },
    });
    if (officer) {
      await logActivity(tx, companyId, {
        userId: officer.userId,
        userName: officer.userName,
        module: 'Visitas',
        action: 'Salida registrada',
        target: `${checkin.authorization.visitorName} (${checkin.authorization.visitType}) · ${checkin.authorization.property.code}`,
      });
    }
    return checkin;
  });
}

// ---------- Gestión de la autorización ----------
export async function setVisitStatus(
  companyId: string,
  authorizationId: string,
  status: 'suspendida' | 'vigente' | 'cancelada',
  actor: { userId: string; userName: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const visit = await tx.visitAuthorization.update({
      where: { id: authorizationId },
      data: { status, suspendedAt: status === 'suspendida' ? new Date() : null },
      include: { property: { select: { code: true } } },
    });
    const ACTION = {
      suspendida: 'Autorización suspendida',
      vigente: 'Autorización reactivada',
      cancelada: 'Autorización cancelada',
    } as const;
    await logActivity(tx, companyId, {
      userId: actor.userId,
      userName: actor.userName,
      module: 'Visitas',
      action: ACTION[status],
      target: `${visit.visitorName} · ${visit.property.code}`,
    });
    return visit;
  });
}

// ---------- Dashboard de seguridad ----------
export async function getSecurityDashboard(companyId: string, condominiumId: string) {
  const visits = await listVisits(companyId, condominiumId);
  const today = todayStr();
  const dow = new Date().getDay();

  const expectedToday = visits.filter(
    (v) =>
      v.status === 'vigente' &&
      !isInside(v) &&
      !hasFinished(v) &&
      (dateOnly(v.validDate) === today || v.visitType === 'recurrente' || v.schedules.some((s) => s.dayOfWeek === dow))
  );
  const inside = visits.filter(isInside);
  const todayCheckins = visits.flatMap((v) => v.checkins).filter((c) => dateOnly(new Date(c.checkinAt)) === today);
  const finished = visits.flatMap((v) => v.checkins).filter((c) => c.checkoutAt);
  const avgStayMinutes = finished.length
    ? Math.round(
        finished.reduce((s, c) => s + (new Date(c.checkoutAt!).getTime() - new Date(c.checkinAt).getTime()), 0) /
          finished.length /
          60000
      )
    : 0;

  return {
    expectedToday: expectedToday.length,
    inside: inside.length,
    deliveriesPendingExit: inside.filter((v) => v.visitType === 'entrega').length,
    employeesPresent: inside.filter((v) => v.visitType === 'empleado').length,
    outOfScheduleAttempts: todayCheckins.filter((c) => c.overrideOutOfSchedule).length,
    avgStayMinutes,
  };
}

// ---------- Alertas para el residente ----------
export type ResidentVisitAlert = {
  id: string;
  kind: 'ingreso' | 'salio' | 'fuera_horario' | 'por_vencer';
  text: string;
  when: Date;
};

/**
 * Avisos de las últimas 48 h a partir de las visitas YA cargadas.
 *
 * Antes iba a buscarlas por su cuenta, y la pantalla del residente
 * también las pedía: la misma consulta —sin límite, con horarios y
 * todos los ingresos incluidos— corría dos veces por carga para
 * mostrar avisos de dos días. Ahora es una función pura sobre la lista
 * que la pantalla ya tiene.
 */
export function getResidentVisitAlerts(visits: VisitaDeFilial[]): ResidentVisitAlert[] {
  const alerts: ResidentVisitAlert[] = [];
  const since = Date.now() - 48 * 3600 * 1000; // últimas 48 h

  for (const v of visits) {
    for (const c of v.checkins) {
      if (new Date(c.checkinAt).getTime() > since) {
        if (c.overrideOutOfSchedule) {
          alerts.push({ id: `${c.id}-oh`, kind: 'fuera_horario', text: `${v.visitorName} ingresó FUERA de su horario autorizado`, when: new Date(c.checkinAt) });
        } else {
          alerts.push({ id: `${c.id}-in`, kind: 'ingreso', text: `${v.visitorName} ingresó al condominio`, when: new Date(c.checkinAt) });
        }
      }
      if (c.checkoutAt && new Date(c.checkoutAt).getTime() > since) {
        alerts.push({ id: `${c.id}-out`, kind: 'salio', text: `${v.visitorName} salió del condominio`, when: new Date(c.checkoutAt) });
      }
    }
    // Vencimientos próximos: 7 días para recurrentes, 24 h para el resto.
    if (v.endDate && ['vigente', 'suspendida'].includes(v.status)) {
      const msLeft = new Date(v.endDate).getTime() - Date.now();
      const windowMs = (v.visitType === 'recurrente' ? 7 * 24 : 24) * 3600 * 1000;
      if (msLeft > 0 && msLeft <= windowMs) {
        const days = Math.ceil(msLeft / (24 * 3600 * 1000));
        alerts.push({ id: `${v.id}-exp`, kind: 'por_vencer', text: `La autorización de ${v.visitorName} vence en ${days} día(s)`, when: new Date(v.endDate) });
      }
    }
  }
  return alerts.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 12);
}
