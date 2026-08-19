/**
 * Depreciación de activos (Etapa 6) — lineal, por ahora.
 *
 * Convención de "mes transcurrido": cuenta PERÍODOS calendario
 * ("YYYY-MM"), no días exactos — el mismo grano que usa la corrida
 * periódica (`services/asset-depreciation.ts`, un renglón por
 * "YYYY-MM"). Un activo que empieza a depreciarse el 31 de enero ya
 * cuenta enero completo: es la convención de mes completo, común en
 * depreciación contable, y evita el caso raro de "31 de enero → 28 de
 * febrero" con prorrateo por día.
 */

import { round2 } from './late-interest';

export type AssetDepreciationInput = {
  acquisitionValue: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationStartDate: Date;
};

export type DepreciationSnapshot = {
  baseDepreciable: number;
  monthlyDepreciation: number;
  monthsElapsed: number;
  /** Nunca supera `baseDepreciable`. */
  accumulatedDepreciation: number;
  /** Nunca baja de `residualValue`. */
  bookValue: number;
  fullyDepreciated: boolean;
};

function periodIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Cuántos períodos ("YYYY-MM") transcurrieron desde `start` hasta `asOf`, incluyendo ambos. Nunca negativo. */
export function monthsElapsed(start: Date, asOf: Date): number {
  return Math.max(0, periodIndex(asOf) - periodIndex(start) + 1);
}

export function calculateDepreciation(input: AssetDepreciationInput, asOf: Date): DepreciationSnapshot {
  const { acquisitionValue, residualValue, usefulLifeMonths, depreciationStartDate } = input;

  const none: DepreciationSnapshot = {
    baseDepreciable: 0,
    monthlyDepreciation: 0,
    monthsElapsed: 0,
    accumulatedDepreciation: 0,
    bookValue: round2(acquisitionValue),
    fullyDepreciated: false,
  };
  // Un activo sin vida útil o sin valor de adquisición no se puede
  // depreciar — no es un error, simplemente no aplica (ej. un activo
  // pequeño registrado solo por inventario).
  if (usefulLifeMonths <= 0 || acquisitionValue <= 0) return none;

  const baseDepreciable = round2(Math.max(0, acquisitionValue - residualValue));
  const monthlyDepreciation = baseDepreciable > 0 ? round2(baseDepreciable / usefulLifeMonths) : 0;
  const elapsed = Math.min(usefulLifeMonths, monthsElapsed(depreciationStartDate, asOf));
  const accumulatedDepreciation = Math.min(baseDepreciable, round2(monthlyDepreciation * elapsed));
  const bookValue = round2(Math.max(residualValue, acquisitionValue - accumulatedDepreciation));

  return {
    baseDepreciable,
    monthlyDepreciation,
    monthsElapsed: elapsed,
    accumulatedDepreciation,
    bookValue,
    // No solo "ya se acumuló toda la base" — también cubre el caso
    // baseDepreciable = 0 (adquisición = residual, nada que depreciar).
    fullyDepreciated: bookValue <= residualValue,
  };
}

/**
 * Cuánto corresponde depreciar en el PRÓXIMO período, dado lo que ya
 * se acumuló hasta ahora (viene de sumar los renglones ya registrados
 * en `AssetDepreciationEntry`). Es la pieza que garantiza los dos "no
 * permitir" de monto: nunca deja pasar la base depreciable (por lo
 * tanto, tampoco deja bajar el valor en libros del residual).
 */
export function nextPeriodAmount(input: AssetDepreciationInput, alreadyAccumulated: number): number {
  const { acquisitionValue, residualValue, usefulLifeMonths } = input;
  if (usefulLifeMonths <= 0 || acquisitionValue <= 0) return 0;

  const baseDepreciable = round2(Math.max(0, acquisitionValue - residualValue));
  if (baseDepreciable <= 0) return 0;

  const monthlyDepreciation = round2(baseDepreciable / usefulLifeMonths);
  const remaining = round2(baseDepreciable - alreadyAccumulated);
  if (remaining <= 0) return 0;

  return Math.min(monthlyDepreciation, remaining);
}
