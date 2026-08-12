import { describe, it, expect } from 'vitest';
import { waterAmount, validateTiers, type WaterTier } from '@/lib/domain/water';

// Tarifa de ejemplo: 0-10 m³ a 500, 10-30 m³ a 800, de ahí en adelante 1200.
const TIERS: WaterTier[] = [
  { upToM3: 10, pricePerM3: 500 },
  { upToM3: 30, pricePerM3: 800 },
  { upToM3: null, pricePerM3: 1200 },
];

describe('waterAmount — tarifa escalonada marginal', () => {
  it('cobra cero por consumo cero', () => {
    expect(waterAmount(TIERS, 0)).toBe(0);
  });

  it('consumo dentro del primer tramo', () => {
    expect(waterAmount(TIERS, 8)).toBe(8 * 500);
  });

  it('el techo exacto del primer tramo no toca el segundo', () => {
    expect(waterAmount(TIERS, 10)).toBe(10 * 500);
  });

  it('reparte entre tramos de forma MARGINAL, no aplica el precio del tramo a todo', () => {
    // 25 m³ = 10 al primer precio + 15 al segundo. Si cobrara los 25
    // al precio del segundo tramo (20 000), estaría mal: la tarifa
    // escalonada solo encarece los m³ que exceden cada techo.
    expect(waterAmount(TIERS, 25)).toBe(10 * 500 + 15 * 800);
  });

  it('usa el tramo abierto ("en adelante") para el excedente', () => {
    expect(waterAmount(TIERS, 40)).toBe(10 * 500 + 20 * 800 + 10 * 1200);
  });

  it('consumo fraccionario', () => {
    expect(waterAmount(TIERS, 12.5)).toBe(10 * 500 + 2.5 * 800);
  });

  it('sin tramos cobra cero', () => {
    expect(waterAmount([], 20)).toBe(0);
  });

  it('un único tramo abierto es una tarifa por m³ simple', () => {
    expect(waterAmount([{ upToM3: null, pricePerM3: 750 }], 13)).toBe(9750);
  });

  it('redondea a 2 decimales', () => {
    expect(waterAmount([{ upToM3: null, pricePerM3: 333.333 }], 3)).toBe(1000);
  });
});

describe('validateTiers', () => {
  it('acepta la tarifa de ejemplo', () => {
    expect(validateTiers(TIERS)).toBeNull();
  });

  it('rechaza vacío', () => {
    expect(validateTiers([])).toMatch(/al menos un tramo/);
  });

  it('rechaza techos que no crecen', () => {
    expect(
      validateTiers([
        { upToM3: 10, pricePerM3: 500 },
        { upToM3: 10, pricePerM3: 800 },
      ])
    ).toMatch(/mayor que/);
  });

  it('rechaza un tramo abierto que no sea el último', () => {
    expect(
      validateTiers([
        { upToM3: null, pricePerM3: 500 },
        { upToM3: 20, pricePerM3: 800 },
      ])
    ).toMatch(/último tramo/);
  });

  it('rechaza precios negativos', () => {
    expect(validateTiers([{ upToM3: null, pricePerM3: -1 }])).toMatch(/precio/);
  });
});
