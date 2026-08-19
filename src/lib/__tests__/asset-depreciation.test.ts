import { describe, it, expect } from 'vitest';
import { monthsElapsed, calculateDepreciation, nextPeriodAmount, type AssetDepreciationInput } from '@/lib/domain/asset-depreciation';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('meses transcurridos (por período calendario, no por día exacto)', () => {
  it('el mismo mes del inicio ya cuenta 1', () => {
    expect(monthsElapsed(d('2026-01-15'), d('2026-01-20'))).toBe(1);
  });

  it('un mes después cuenta 2 (inclusive de ambos extremos)', () => {
    expect(monthsElapsed(d('2026-01-15'), d('2026-02-01'))).toBe(2);
  });

  it('31 de enero a 28 de febrero cuenta 2 — mes completo, sin prorrateo por día', () => {
    expect(monthsElapsed(d('2026-01-31'), d('2026-02-28'))).toBe(2);
  });

  it('antes del inicio nunca es negativo', () => {
    expect(monthsElapsed(d('2026-03-01'), d('2026-01-01'))).toBe(0);
  });
});

describe('cálculo de depreciación lineal', () => {
  const base: AssetDepreciationInput = {
    acquisitionValue: 1_200_000,
    residualValue: 200_000,
    usefulLifeMonths: 20,
    depreciationStartDate: d('2026-01-01'),
  };

  it('caso base: base depreciable y cuota mensual', () => {
    const r = calculateDepreciation(base, d('2026-01-15'));
    expect(r.baseDepreciable).toBe(1_000_000); // 1.200.000 − 200.000
    expect(r.monthlyDepreciation).toBe(50_000); // 1.000.000 / 20
    expect(r.monthsElapsed).toBe(1);
    expect(r.accumulatedDepreciation).toBe(50_000);
    expect(r.bookValue).toBe(1_150_000);
    expect(r.fullyDepreciated).toBe(false);
  });

  it('a mitad de la vida útil acumula la mitad de la base', () => {
    const r = calculateDepreciation(base, d('2026-10-01')); // 10 meses transcurridos
    expect(r.monthsElapsed).toBe(10);
    expect(r.accumulatedDepreciation).toBe(500_000);
    expect(r.bookValue).toBe(700_000);
  });

  it('nunca supera la base depreciable ni baja del valor residual, aunque pase mucho más tiempo que la vida útil', () => {
    const r = calculateDepreciation(base, d('2030-01-01')); // muy por delante de los 20 meses
    expect(r.monthsElapsed).toBe(20); // se topa en usefulLifeMonths
    expect(r.accumulatedDepreciation).toBe(1_000_000); // = baseDepreciable, nunca más
    expect(r.bookValue).toBe(200_000); // = residualValue, nunca menos
    expect(r.fullyDepreciated).toBe(true);
  });

  it('valor residual 0: la base depreciable es el valor de adquisición completo', () => {
    const r = calculateDepreciation({ ...base, residualValue: 0 }, d('2030-01-01'));
    expect(r.baseDepreciable).toBe(1_200_000);
    expect(r.bookValue).toBe(0);
    expect(r.fullyDepreciated).toBe(true);
  });

  it('adquisición igual al residual: nada que depreciar, ya "fully depreciated" desde el día uno', () => {
    const r = calculateDepreciation({ ...base, acquisitionValue: 200_000, residualValue: 200_000 }, d('2026-01-15'));
    expect(r.baseDepreciable).toBe(0);
    expect(r.monthlyDepreciation).toBe(0);
    expect(r.bookValue).toBe(200_000);
    expect(r.fullyDepreciated).toBe(true);
  });

  it('sin vida útil o sin valor de adquisición: no se puede depreciar, el valor en libros es el de adquisición', () => {
    expect(calculateDepreciation({ ...base, usefulLifeMonths: 0 }, d('2026-06-01')).bookValue).toBe(1_200_000);
    expect(calculateDepreciation({ ...base, acquisitionValue: 0 }, d('2026-06-01')).bookValue).toBe(0);
  });
});

describe('monto del próximo período (nextPeriodAmount) — no permitir superar la base', () => {
  const base: AssetDepreciationInput = {
    acquisitionValue: 1_200_000,
    residualValue: 200_000,
    usefulLifeMonths: 20,
    depreciationStartDate: d('2026-01-01'),
  };

  it('período normal: la cuota mensual completa', () => {
    expect(nextPeriodAmount(base, 0)).toBe(50_000);
    expect(nextPeriodAmount(base, 150_000)).toBe(50_000);
  });

  it('último período: monto parcial para cerrar EXACTO en la base, nunca más', () => {
    // Base 1.000.000, cuota 50.000 — a los 950.000 acumulados solo faltan 50.000 (calza exacto).
    expect(nextPeriodAmount(base, 950_000)).toBe(50_000);
    // Si por cualquier motivo lo acumulado no calza con la cuota exacta (ej. 970.000), el resto es 30.000, nunca 50.000.
    expect(nextPeriodAmount(base, 970_000)).toBe(30_000);
  });

  it('ya completamente depreciado: no hay nada más que registrar', () => {
    expect(nextPeriodAmount(base, 1_000_000)).toBe(0);
    expect(nextPeriodAmount(base, 1_500_000)).toBe(0); // sobre-acumulado por error en otro lado, igual nunca da negativo
  });

  it('sin vida útil configurada: 0, nunca lanza', () => {
    expect(nextPeriodAmount({ ...base, usefulLifeMonths: 0 }, 0)).toBe(0);
  });
});
