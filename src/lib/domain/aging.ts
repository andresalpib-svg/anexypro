/**
 * Antigüedad de saldos (aging).
 *
 * ₡2,3 millones de cartera repartidos en el mes corriente y ₡2,3
 * millones con más de 90 días son situaciones completamente
 * distintas, y el total no las distingue. Por eso la morosidad se
 * mide por tramos y no por monto.
 */

import { round2 } from './late-interest';

export type AgingBucket = 'corriente' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_mas';

export const BUCKET_LABEL: Record<AgingBucket, string> = {
  corriente: 'Al día',
  d1_30: '1 a 30 días',
  d31_60: '31 a 60 días',
  d61_90: '61 a 90 días',
  d90_mas: 'Más de 90 días',
};

/** Orden de gravedad, para pintar y ordenar siempre igual. */
export const BUCKET_ORDER: AgingBucket[] = ['corriente', 'd1_30', 'd31_60', 'd61_90', 'd90_mas'];

export function bucketOf(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'corriente';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_mas';
}

export function daysOverdue(dueDate: Date, today: Date): number {
  const a = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

export type AgingInput = {
  propertyId: string;
  outstanding: number;
  dueDate: Date;
};

export type PropertyAging = {
  propertyId: string;
  total: number;
  buckets: Record<AgingBucket, number>;
  /** Días de mora del cargo vencido MÁS ANTIGUO. */
  oldestDays: number;
};

export type AgingSummary = {
  byProperty: PropertyAging[];
  totals: Record<AgingBucket, number>;
  total: number;
  overdue: number;
  /** Cartera vencida ÷ cartera total. Es el indicador de morosidad. */
  overdueRatio: number;
};

const emptyBuckets = (): Record<AgingBucket, number> => ({
  corriente: 0,
  d1_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_mas: 0,
});

export function buildAging(items: AgingInput[], today: Date): AgingSummary {
  const map = new Map<string, PropertyAging>();
  const totals = emptyBuckets();

  for (const item of items) {
    // Un cargo saldado o con abono de más no entra en la cartera.
    if (item.outstanding <= 0) continue;

    const days = daysOverdue(item.dueDate, today);
    const bucket = bucketOf(days);

    if (!map.has(item.propertyId)) {
      map.set(item.propertyId, {
        propertyId: item.propertyId,
        total: 0,
        buckets: emptyBuckets(),
        oldestDays: 0,
      });
    }
    const row = map.get(item.propertyId)!;
    row.total += item.outstanding;
    row.buckets[bucket] += item.outstanding;
    if (days > row.oldestDays) row.oldestDays = days;

    totals[bucket] += item.outstanding;
  }

  const total = Object.values(totals).reduce((s, v) => s + v, 0);
  const overdue = total - totals.corriente;

  // Redondeo consistente: antes solo el total agregado (de abajo) se
  // redondeaba con `Math.round(...*100)/100` — el total POR FILA
  // (`row.total`, acumulado con `+=` sobre `outstanding` sin redondear
  // en ningún punto) y los totales por tramo quedaban con el ruido de
  // punto flotante de sumar decimales (ej. `188.64000000000001`),
  // visible en el Excel de cobranza aunque el total general se viera
  // limpio.
  const roundedTotals = emptyBuckets();
  for (const bucket of BUCKET_ORDER) roundedTotals[bucket] = round2(totals[bucket]);
  const byProperty = [...map.values()].map((p) => {
    const buckets = emptyBuckets();
    for (const bucket of BUCKET_ORDER) buckets[bucket] = round2(p.buckets[bucket]);
    return { ...p, total: round2(p.total), buckets };
  });

  return {
    // Los que más deben y hace más tiempo van primero: es el orden en
    // que hay que gestionarlos.
    byProperty: byProperty.sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total),
    totals: roundedTotals,
    total: round2(total),
    overdue: round2(overdue),
    overdueRatio: total > 0 ? overdue / total : 0,
  };
}

/**
 * Qué acción de cobro corresponde según los días de mora.
 * Es el escalamiento por omisión; cada condominio puede ajustarlo.
 */
export type CollectionStep = {
  type: string;
  label: string;
  minDays: number;
};

export const COLLECTION_LADDER: CollectionStep[] = [
  { type: 'recordatorio', label: 'Recordatorio amable', minDays: 1 },
  { type: 'aviso_vencido', label: 'Aviso de cuota vencida', minDays: 8 },
  { type: 'aviso_formal', label: 'Aviso formal de cobro', minDays: 30 },
  { type: 'aviso_suspension', label: 'Aviso de suspensión de servicios', minDays: 60 },
  { type: 'expediente_legal', label: 'Preparar expediente de cobro judicial', minDays: 90 },
];

/** El escalón que corresponde hoy, o null si aún está al día. */
export function stepFor(days: number): CollectionStep | null {
  let current: CollectionStep | null = null;
  for (const step of COLLECTION_LADDER) {
    if (days >= step.minDays) current = step;
  }
  return current;
}
