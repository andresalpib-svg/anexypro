/**
 * Cálculo del cobro de agua potable.
 *
 * Espejo EXACTO de la función SQL `water_amount` de
 * prisma/sql/01_views_functions_triggers.sql: tarifa escalonada
 * MARGINAL — cada tramo cobra solo los m³ que caen dentro de él, como
 * la tarifa de AyA. Vive también en TypeScript para que el formulario
 * muestre el monto antes de generar el cobro y para poder probarlo.
 */

export type WaterTier = {
  /** Techo del tramo en m³; null = "en adelante" (último tramo). */
  upToM3: number | null;
  pricePerM3: number;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Monto por consumo con tarifa escalonada marginal. Los tramos deben
 * venir ordenados (tierOrder ascendente).
 */
export function waterAmount(tiers: WaterTier[], m3: number): number {
  let remaining = m3;
  let prevCap = 0;
  let total = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const span = t.upToM3 === null ? remaining : Math.min(remaining, t.upToM3 - prevCap);
    if (t.upToM3 !== null) prevCap = t.upToM3;
    if (span > 0) {
      total += span * t.pricePerM3;
      remaining -= span;
    }
  }
  return round2(total);
}

/**
 * Valida una configuración de tramos antes de guardarla. Devuelve el
 * problema en palabras, o null si está bien.
 */
export function validateTiers(tiers: WaterTier[]): string | null {
  if (tiers.length === 0) return 'Agregá al menos un tramo.';
  let prevCap = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!;
    if (!Number.isFinite(t.pricePerM3) || t.pricePerM3 < 0) {
      return `El precio del tramo ${i + 1} no es válido.`;
    }
    if (t.upToM3 === null) {
      if (i !== tiers.length - 1) return 'Solo el último tramo puede quedar sin techo ("en adelante").';
      continue;
    }
    if (!Number.isFinite(t.upToM3) || t.upToM3 <= prevCap) {
      return `El techo del tramo ${i + 1} debe ser mayor que el del tramo anterior.`;
    }
    prevCap = t.upToM3;
  }
  return null;
}
