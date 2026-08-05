/**
 * Cálculo del interés moratorio — lógica pura y sin base de datos,
 * para poder probarla exhaustivamente.
 *
 * Reglas de negocio (documentadas porque un error aquí le cobra de
 * más a un condómino, y eso es un problema legal, no un bug):
 *
 *  1. Solo se calcula sobre el SALDO pendiente del cargo, no sobre su
 *     monto original: si el condómino abonó, el interés baja.
 *  2. Los días de mora se cuentan desde el vencimiento MÁS los días
 *     de gracia. Dentro de la gracia no hay interés.
 *  3. Interés simple: la base es siempre el saldo del cargo original.
 *     Nunca se cobra interés sobre interés.
 *     Interés compuesto: la base incluye los intereses ya generados.
 *  4. El acumulado nunca supera el tope configurado (% del saldo).
 *  5. El cálculo es ACUMULATIVO: se calcula cuánto interés
 *     corresponde en total al día de hoy y se resta lo ya cobrado.
 *     Por eso correr el proceso dos veces el mismo día no cobra de
 *     más, y saltarse un día no deja un hueco.
 */

export type InterestPolicy = {
  /** Tasa mensual en porcentaje. 2 = 2 % mensual. */
  monthlyRatePct: number;
  /** Días de gracia después del vencimiento. */
  graceDays: number;
  /** 'simple' | 'compuesto' */
  interestType: string;
  /** Tope del interés acumulado como % del saldo. 0 = sin tope. */
  maxPct: number;
};

export type InterestInput = {
  /** Saldo pendiente del cargo base (monto − abonos). */
  outstanding: number;
  /** Vencimiento del cargo base. */
  dueDate: Date;
  /** Fecha de cálculo. */
  today: Date;
  /** Interés ya cobrado antes por este mismo cargo. */
  alreadyCharged: number;
  policy: InterestPolicy;
};

export type InterestResult = {
  /** Días de mora efectivos, ya descontada la gracia. */
  daysLate: number;
  /** Interés que corresponde en total al día de hoy. */
  accrued: number;
  /** Lo que falta cobrar = accrued − alreadyCharged. Nunca negativo. */
  toCharge: number;
  /** Si el acumulado quedó limitado por el tope. */
  cappedByLimit: boolean;
};

const MS_PER_DAY = 86_400_000;

/** Días calendario entre dos fechas, comparando por día UTC. */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / MS_PER_DAY);
}

/** Redondeo a 2 decimales sin arrastrar el error binario del float. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateLateInterest(input: InterestInput): InterestResult {
  const { outstanding, dueDate, today, alreadyCharged, policy } = input;

  const none: InterestResult = { daysLate: 0, accrued: 0, toCharge: 0, cappedByLimit: false };

  // Un cargo saldado (o con saldo negativo por un abono de más) no
  // genera interés, aunque en su momento haya estado vencido.
  if (outstanding <= 0) return none;
  if (policy.monthlyRatePct <= 0) return none;

  const graceEnd = new Date(dueDate.getTime() + policy.graceDays * MS_PER_DAY);
  const daysLate = daysBetween(graceEnd, today);
  if (daysLate <= 0) return none;

  const monthlyRate = policy.monthlyRatePct / 100;
  const months = daysLate / 30;

  let accrued: number;
  if (policy.interestType === 'compuesto') {
    // Capitalización mensual sobre el saldo.
    accrued = outstanding * (Math.pow(1 + monthlyRate, months) - 1);
  } else {
    accrued = outstanding * monthlyRate * months;
  }

  let cappedByLimit = false;
  if (policy.maxPct > 0) {
    const cap = outstanding * (policy.maxPct / 100);
    if (accrued > cap) {
      accrued = cap;
      cappedByLimit = true;
    }
  }

  accrued = round2(accrued);
  const toCharge = round2(Math.max(0, accrued - alreadyCharged));

  return { daysLate, accrued, toCharge, cappedByLimit };
}
