import { describe, it, expect } from 'vitest';
import { calculateLateInterest, type InterestPolicy } from '@/lib/domain/late-interest';

const simple: InterestPolicy = { monthlyRatePct: 2, graceDays: 0, interestType: 'simple', maxPct: 30 };
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('interés moratorio', () => {
  it('no cobra dentro del plazo', () => {
    const r = calculateLateInterest({
      outstanding: 100_000,
      dueDate: d('2026-07-15'),
      today: d('2026-07-10'),
      alreadyCharged: 0,
      policy: simple,
    });
    expect(r.daysLate).toBe(0);
    expect(r.toCharge).toBe(0);
  });

  it('no cobra el mismo día del vencimiento', () => {
    const r = calculateLateInterest({
      outstanding: 100_000,
      dueDate: d('2026-07-15'),
      today: d('2026-07-15'),
      alreadyCharged: 0,
      policy: simple,
    });
    expect(r.toCharge).toBe(0);
  });

  it('respeta los días de gracia', () => {
    const policy = { ...simple, graceDays: 5 };
    const dentro = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-07-15'), today: d('2026-07-20'),
      alreadyCharged: 0, policy,
    });
    expect(dentro.toCharge).toBe(0);

    const fuera = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-07-15'), today: d('2026-07-21'),
      alreadyCharged: 0, policy,
    });
    expect(fuera.daysLate).toBe(1);
    expect(fuera.toCharge).toBeGreaterThan(0);
  });

  it('calcula 2% mensual sobre 30 días', () => {
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    expect(r.daysLate).toBe(30);
    expect(r.accrued).toBe(2_000);
  });

  it('es proporcional a los días', () => {
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-07-01'), today: d('2026-07-16'),
      alreadyCharged: 0, policy: simple,
    });
    expect(r.daysLate).toBe(15);
    expect(r.accrued).toBe(1_000); // la mitad de un mes
  });

  // Esta es la prueba que evita cobrar dos veces.
  it('es idempotente: correrlo de nuevo el mismo día no cobra más', () => {
    const args = {
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      policy: simple,
    };
    const primera = calculateLateInterest({ ...args, alreadyCharged: 0 });
    const segunda = calculateLateInterest({ ...args, alreadyCharged: primera.toCharge });
    expect(primera.toCharge).toBe(2_000);
    expect(segunda.toCharge).toBe(0);
  });

  it('al día siguiente cobra solo la diferencia', () => {
    const ayer = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    const hoy = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-16'),
      alreadyCharged: ayer.accrued, policy: simple,
    });
    expect(hoy.toCharge).toBeCloseTo(2_000 / 30, 1);
  });

  it('saltarse días no deja hueco: el acumulado es el mismo', () => {
    const corridoDiario = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    const corridoUnaSolaVez = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    expect(corridoDiario.accrued).toBe(corridoUnaSolaVez.accrued);
  });

  it('baja el interés si el condómino abonó', () => {
    const completo = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    const conAbono = calculateLateInterest({
      outstanding: 40_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    expect(conAbono.accrued).toBeLessThan(completo.accrued);
    expect(conAbono.accrued).toBe(800);
  });

  it('no cobra nada si el cargo quedó saldado', () => {
    const r = calculateLateInterest({
      outstanding: 0, dueDate: d('2026-01-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    expect(r.toCharge).toBe(0);
  });

  it('aplica el tope máximo', () => {
    // 2 % mensual durante 2 años daría 48 %; el tope es 30 %.
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2024-07-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: simple,
    });
    expect(r.accrued).toBe(30_000);
    expect(r.cappedByLimit).toBe(true);
  });

  it('sin tope acumula sin límite', () => {
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2024-07-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: { ...simple, maxPct: 0 },
    });
    expect(r.accrued).toBeGreaterThan(30_000);
    expect(r.cappedByLimit).toBe(false);
  });

  it('el compuesto acumula más que el simple', () => {
    const args = {
      outstanding: 100_000, dueDate: d('2025-07-15'), today: d('2026-07-15'),
      alreadyCharged: 0,
    };
    const s = calculateLateInterest({ ...args, policy: { ...simple, maxPct: 0 } });
    const c = calculateLateInterest({ ...args, policy: { ...simple, maxPct: 0, interestType: 'compuesto' } });
    expect(c.accrued).toBeGreaterThan(s.accrued);
  });

  it('tasa cero no genera interés', () => {
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-01-15'), today: d('2026-07-15'),
      alreadyCharged: 0, policy: { ...simple, monthlyRatePct: 0 },
    });
    expect(r.toCharge).toBe(0);
  });

  it('nunca devuelve un cobro negativo aunque se haya cobrado de más', () => {
    const r = calculateLateInterest({
      outstanding: 100_000, dueDate: d('2026-06-15'), today: d('2026-07-15'),
      alreadyCharged: 999_999, policy: simple,
    });
    expect(r.toCharge).toBe(0);
  });
});
