import { describe, it, expect } from 'vitest';
import { buildAging, bucketOf, stepFor, daysOverdue } from '@/lib/domain/aging';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const hoy = d('2026-07-26');

describe('tramos de antigüedad', () => {
  it('clasifica cada tramo en su lugar', () => {
    expect(bucketOf(0)).toBe('corriente');
    expect(bucketOf(-5)).toBe('corriente');
    expect(bucketOf(1)).toBe('d1_30');
    expect(bucketOf(30)).toBe('d1_30');
    expect(bucketOf(31)).toBe('d31_60');
    expect(bucketOf(60)).toBe('d31_60');
    expect(bucketOf(61)).toBe('d61_90');
    expect(bucketOf(90)).toBe('d61_90');
    expect(bucketOf(91)).toBe('d90_mas');
  });

  it('cuenta los días por calendario UTC', () => {
    expect(daysOverdue(d('2026-07-15'), hoy)).toBe(11);
    expect(daysOverdue(d('2026-07-26'), hoy)).toBe(0);
    expect(daysOverdue(d('2026-08-15'), hoy)).toBe(-20);
  });
});

describe('cartera por antigüedad', () => {
  const cartera = [
    { propertyId: 'casa-01', outstanding: 75_000, dueDate: d('2026-08-15') }, // futuro
    { propertyId: 'casa-02', outstanding: 75_000, dueDate: d('2026-07-15') }, // 11 días
    { propertyId: 'casa-02', outstanding: 75_000, dueDate: d('2026-06-15') }, // 41 días
    { propertyId: 'casa-03', outstanding: 50_000, dueDate: d('2026-01-15') }, // 192 días
  ];

  const r = buildAging(cartera, hoy);

  it('reparte los montos en sus tramos', () => {
    expect(r.totals.corriente).toBe(75_000);
    expect(r.totals.d1_30).toBe(75_000);
    expect(r.totals.d31_60).toBe(75_000);
    expect(r.totals.d90_mas).toBe(50_000);
  });

  it('suma la cartera total y la vencida por separado', () => {
    expect(r.total).toBe(275_000);
    expect(r.overdue).toBe(200_000); // todo menos lo corriente
  });

  it('calcula el índice de morosidad', () => {
    expect(r.overdueRatio).toBeCloseTo(200_000 / 275_000, 4);
  });

  it('agrupa por filial y suma su deuda', () => {
    const casa02 = r.byProperty.find((p) => p.propertyId === 'casa-02')!;
    expect(casa02.total).toBe(150_000);
    expect(casa02.oldestDays).toBe(41);
  });

  // El orden importa: es el orden en que hay que gestionar la cobranza.
  it('ordena por antigüedad, del más viejo al más reciente', () => {
    expect(r.byProperty[0]!.propertyId).toBe('casa-03'); // 192 días
    expect(r.byProperty[1]!.propertyId).toBe('casa-02'); // 41 días
  });

  it('ignora los cargos ya saldados', () => {
    const conSaldados = buildAging(
      [...cartera, { propertyId: 'casa-09', outstanding: 0, dueDate: d('2026-01-01') }],
      hoy
    );
    expect(conSaldados.byProperty.some((p) => p.propertyId === 'casa-09')).toBe(false);
  });

  it('una cartera vacía no rompe el cálculo', () => {
    const vacia = buildAging([], hoy);
    expect(vacia.total).toBe(0);
    expect(vacia.overdueRatio).toBe(0);
  });
});

describe('escalamiento de cobranza', () => {
  it('no corresponde ninguna acción si está al día', () => {
    expect(stepFor(0)).toBeNull();
  });

  it('devuelve el escalón que corresponde a los días de mora', () => {
    expect(stepFor(3)?.type).toBe('recordatorio');
    expect(stepFor(10)?.type).toBe('aviso_vencido');
    expect(stepFor(45)?.type).toBe('aviso_formal');
    expect(stepFor(75)?.type).toBe('aviso_suspension');
    expect(stepFor(120)?.type).toBe('expediente_legal');
  });

  it('no se salta escalones hacia atrás', () => {
    // Con 200 días sigue correspondiendo el último escalón, no otro.
    expect(stepFor(200)?.type).toBe('expediente_legal');
  });
});
