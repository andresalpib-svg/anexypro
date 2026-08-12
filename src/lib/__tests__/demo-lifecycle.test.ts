import { describe, it, expect } from 'vitest';
import {
  demoLifecycleDates,
  deriveTimeBasedPhase,
  daysRemaining,
  DEMO_TRIAL_DAYS,
  DEMO_DELETE_GRACE_DAYS,
} from '@/lib/domain/demo-lifecycle';

describe('demoLifecycleDates()', () => {
  it('el vencimiento cae exactamente 15 días después del inicio', () => {
    const inicio = new Date('2026-08-01T10:00:00Z');
    const { expiresAt } = demoLifecycleDates(inicio);
    expect(expiresAt.toISOString()).toBe('2026-08-16T10:00:00.000Z');
  });

  it('la eliminación programada cae exactamente 18 días después del inicio (15 + 3)', () => {
    const inicio = new Date('2026-08-01T10:00:00Z');
    const { deleteScheduledAt } = demoLifecycleDates(inicio);
    expect(deleteScheduledAt.toISOString()).toBe('2026-08-19T10:00:00.000Z');
  });

  it('la eliminación programada siempre es 3 días después del vencimiento, no del inicio directamente', () => {
    const inicio = new Date('2026-08-01T10:00:00Z');
    const { expiresAt, deleteScheduledAt } = demoLifecycleDates(inicio);
    expect(deleteScheduledAt.getTime() - expiresAt.getTime()).toBe(DEMO_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  });

  it('respeta las constantes de negocio (15 y 3 días)', () => {
    expect(DEMO_TRIAL_DAYS).toBe(15);
    expect(DEMO_DELETE_GRACE_DAYS).toBe(3);
  });

  it('conserva la hora exacta del inicio (no la redondea a medianoche)', () => {
    const inicio = new Date('2026-08-01T23:47:12.500Z');
    const { expiresAt } = demoLifecycleDates(inicio);
    expect(expiresAt.getUTCHours()).toBe(23);
    expect(expiresAt.getUTCMinutes()).toBe(47);
    expect(expiresAt.getUTCSeconds()).toBe(12);
  });

  it('cruza el fin de mes correctamente (agosto → septiembre)', () => {
    const inicio = new Date('2026-08-20T00:00:00Z');
    const { expiresAt, deleteScheduledAt } = demoLifecycleDates(inicio);
    expect(expiresAt.toISOString().slice(0, 10)).toBe('2026-09-04');
    expect(deleteScheduledAt.toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('deriveTimeBasedPhase()', () => {
  const ahora = new Date('2026-08-10T00:00:00Z');

  it('sin fecha de vencimiento, está activa', () => {
    expect(deriveTimeBasedPhase(null, ahora)).toBe('DEMO_ACTIVO');
    expect(deriveTimeBasedPhase(undefined, ahora)).toBe('DEMO_ACTIVO');
  });

  it('con vencimiento futuro, está activa', () => {
    expect(deriveTimeBasedPhase(new Date('2026-08-11T00:00:00Z'), ahora)).toBe('DEMO_ACTIVO');
  });

  it('con vencimiento pasado, está vencida', () => {
    expect(deriveTimeBasedPhase(new Date('2026-08-09T00:00:00Z'), ahora)).toBe('DEMO_VENCIDO');
  });

  it('en el instante exacto del vencimiento, ya cuenta como vencida', () => {
    expect(deriveTimeBasedPhase(ahora, ahora)).toBe('DEMO_VENCIDO');
  });
});

describe('daysRemaining()', () => {
  const ahora = new Date('2026-08-10T12:00:00Z');

  it('sin fecha de vencimiento, da 0', () => {
    expect(daysRemaining(null, ahora)).toBe(0);
    expect(daysRemaining(undefined, ahora)).toBe(0);
  });

  it('exactamente 15 días por delante da 15', () => {
    expect(daysRemaining(new Date('2026-08-25T12:00:00Z'), ahora)).toBe(15);
  });

  it('redondea hacia arriba: faltan 23 horas → cuenta como 1 día', () => {
    expect(daysRemaining(new Date('2026-08-11T11:00:00Z'), ahora)).toBe(1);
  });

  it('ya vencida da 0, nunca un número negativo', () => {
    expect(daysRemaining(new Date('2026-08-09T00:00:00Z'), ahora)).toBe(0);
  });

  it('vence en este instante exacto → 0', () => {
    expect(daysRemaining(ahora, ahora)).toBe(0);
  });
});
