/**
 * Estado de la suscripción de una empresa administradora.
 *
 * Es una función pura: recibe la fecha de pago y los días de gracia,
 * devuelve en qué situación está la cuenta y qué corresponde hacer. No
 * consulta la base ni escribe nada, así que se prueba entera y la misma
 * lógica sirve para la pantalla del master y para el trabajo diario que
 * genera el aviso.
 *
 * **El estado no se guarda.** Se deriva de la fecha, igual que los
 * saldos del condominio: un estado guardado en una columna se
 * desincroniza en cuanto pasa un día sin que nadie abra la pantalla, y
 * entonces el sistema cree que una empresa está al día cuando no lo
 * está.
 */

export type SubscriptionStatus =
  /** No tiene plan asignado todavía. */
  | 'sin_plan'
  /** Pagada y con fecha de pago futura. */
  | 'al_dia'
  /** Faltan pocos días para el vencimiento. */
  | 'por_vencer'
  /** Venció, pero sigue dentro de los días hábiles de gracia. */
  | 'en_gracia'
  /** Se agotó la gracia: corresponde bloquear. */
  | 'en_mora'
  /** El master ya le cortó el acceso. */
  | 'bloqueada';

export type SubscriptionInput = {
  planId?: string | null;
  nextPaymentDate?: Date | null;
  blockedAt?: Date | null;
  /** Días HÁBILES de gracia del plan. */
  graceDays?: number;
};

export type SubscriptionState = {
  status: SubscriptionStatus;
  /** Días naturales de atraso. Negativo = todavía no vence. */
  daysOverdue: number;
  /** Hasta cuándo dura la gracia (fin del último día hábil). */
  graceUntil: Date | null;
  /** Días hábiles que quedan de gracia. */
  graceDaysLeft: number;
  /** Qué le toca al master. */
  action: 'ninguna' | 'avisar' | 'bloquear' | 'desbloquear';
  label: string;
  /** Frase lista para la pantalla, sin tener que armarla en tres sitios. */
  detail: string;
};

const DIA = 86_400_000;

/**
 * ¿Es día hábil? Sábado y domingo no cuentan.
 *
 * Todo en UTC a propósito. Las fechas de suscripción son `@db.Date` y
 * Prisma las entrega como medianoche UTC; con `getDay()` —que es hora
 * local— en Costa Rica (UTC-6) esa medianoche cae el día anterior a las
 * seis de la tarde, y un sábado se contaría como viernes hábil.
 */
export function esHabil(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia !== 0 && dia !== 6;
}

/**
 * Suma días hábiles a una fecha.
 *
 * El plazo de la suscripción se cuenta en días hábiles porque así se
 * pactó: cinco días naturales que caigan en un fin de semana largo
 * dejarían al cliente sin margen real para pagar.
 */
export function addBusinessDays(desde: Date, dias: number): Date {
  const d = new Date(desde.getTime());
  let restantes = Math.max(0, Math.floor(dias));
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (esHabil(d)) restantes--;
  }
  return d;
}

/** Días hábiles entre dos fechas (0 si `b` es anterior a `a`). */
export function businessDaysBetween(a: Date, b: Date): number {
  if (b <= a) return 0;
  let n = 0;
  const d = new Date(a.getTime());
  while (d < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (esHabil(d) && d <= b) n++;
  }
  return n;
}

/** Días naturales completos entre dos fechas. */
function diasEntre(a: Date, b: Date): number {
  const ini = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const fin = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()));
  return Math.round((fin.getTime() - ini.getTime()) / DIA);
}

/** Cuántos días antes del vencimiento se empieza a avisar. */
const AVISO_PREVIO_DIAS = 7;

export function subscriptionState(sub: SubscriptionInput, now: Date = new Date()): SubscriptionState {
  // Bloqueada manda sobre todo lo demás: es un hecho, no un cálculo.
  if (sub.blockedAt) {
    const dias = sub.nextPaymentDate ? diasEntre(sub.nextPaymentDate, now) : 0;
    return {
      status: 'bloqueada',
      daysOverdue: dias,
      graceUntil: null,
      graceDaysLeft: 0,
      action: 'desbloquear',
      label: 'Bloqueada',
      detail:
        dias > 0
          ? `Acceso bloqueado. La información se conserva completa; se restablece al registrar el pago. Lleva ${dias} día(s) de atraso.`
          : 'Acceso bloqueado. La información se conserva completa; se restablece al registrar el pago.',
    };
  }

  if (!sub.planId || !sub.nextPaymentDate) {
    return {
      status: 'sin_plan',
      daysOverdue: 0,
      graceUntil: null,
      graceDaysLeft: 0,
      action: 'avisar',
      label: 'Sin plan',
      detail: 'Esta empresa no tiene un plan de suscripción asignado.',
    };
  }

  const graceDays = Math.max(0, Math.floor(sub.graceDays ?? 5));
  const atraso = diasEntre(sub.nextPaymentDate, now);

  if (atraso < 0) {
    const faltan = -atraso;
    if (faltan <= AVISO_PREVIO_DIAS) {
      return {
        status: 'por_vencer',
        daysOverdue: atraso,
        graceUntil: null,
        graceDaysLeft: 0,
        action: 'avisar',
        label: 'Por vencer',
        detail: `Vence en ${faltan} día(s), el ${fecha(sub.nextPaymentDate)}.`,
      };
    }
    return {
      status: 'al_dia',
      daysOverdue: atraso,
      graceUntil: null,
      graceDaysLeft: 0,
      action: 'ninguna',
      label: 'Al día',
      detail: `Próximo pago el ${fecha(sub.nextPaymentDate)}.`,
    };
  }

  // Venció: empieza a correr la gracia en días hábiles.
  const graceUntil = addBusinessDays(sub.nextPaymentDate, graceDays);
  const quedan = businessDaysBetween(now, graceUntil);

  // El plazo vence al FINAL del último día hábil, no a su medianoche:
  // si el plazo llega al día 5, el cliente tiene ese día completo para
  // pagar. Comparar contra las 00:00 lo dejaría en mora un día antes.
  const finDelPlazo = new Date(graceUntil.getTime() + DIA - 1);

  if (now <= finDelPlazo) {
    return {
      status: 'en_gracia',
      daysOverdue: atraso,
      graceUntil,
      graceDaysLeft: quedan,
      action: 'avisar',
      label: 'Pago pendiente',
      detail:
        quedan > 0
          ? `Venció el ${fecha(sub.nextPaymentDate)}. Quedan ${quedan} día(s) hábil(es) de plazo, hasta el ${fecha(graceUntil)}.`
          : `Venció el ${fecha(sub.nextPaymentDate)}. Hoy es el último día del plazo.`,
    };
  }

  return {
    status: 'en_mora',
    daysOverdue: atraso,
    graceUntil,
    graceDaysLeft: 0,
    action: 'bloquear',
    label: 'Corresponde bloquear',
    detail: `Venció el ${fecha(sub.nextPaymentDate)} y el plazo de ${graceDays} día(s) hábil(es) se agotó el ${fecha(graceUntil)}. Lleva ${atraso} día(s) de atraso.`,
  };
}

/** Cuándo vence el período siguiente, según la periodicidad del plan. */
export function nextPeriodEnd(desde: Date, period: 'mensual' | 'trimestral' | 'semestral' | 'anual'): Date {
  const meses = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[period];
  const d = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate()));
  const diaOriginal = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + meses);
  // Si el mes destino es más corto (31 de enero + 1 mes), se queda en su
  // último día en vez de saltar al mes siguiente.
  if (d.getUTCDate() !== diaOriginal) d.setUTCDate(0);
  return d;
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export const PERIOD_LABEL: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};
