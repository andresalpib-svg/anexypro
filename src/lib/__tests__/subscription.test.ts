import { describe, it, expect } from 'vitest';
import {
  subscriptionState,
  addBusinessDays,
  businessDaysBetween,
  esHabil,
  nextPeriodEnd,
} from '@/lib/domain/subscription';

// Miércoles 5 de agosto de 2026, para que los fines de semana caigan
// donde se espera en las pruebas de días hábiles.
const MIERCOLES = new Date('2026-08-05T10:00:00Z');
const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('días hábiles', () => {
  it('reconoce sábado y domingo como no hábiles', () => {
    expect(esHabil(dia('2026-08-08'))).toBe(false); // sábado
    expect(esHabil(dia('2026-08-09'))).toBe(false); // domingo
    expect(esHabil(dia('2026-08-10'))).toBe(true); // lunes
  });

  it('saltando el fin de semana, 5 días hábiles desde un miércoles caen el miércoles siguiente', () => {
    expect(addBusinessDays(dia('2026-08-05'), 5).toISOString().slice(0, 10)).toBe('2026-08-12');
  });

  it('desde un viernes, 1 día hábil es el lunes', () => {
    expect(addBusinessDays(dia('2026-08-07'), 1).toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('cuenta los días hábiles entre dos fechas', () => {
    expect(businessDaysBetween(dia('2026-08-05'), dia('2026-08-12'))).toBe(5);
    expect(businessDaysBetween(dia('2026-08-12'), dia('2026-08-05'))).toBe(0);
  });
});

describe('subscriptionState()', () => {
  const plan = { planId: 'p1', graceDays: 5 };

  it('sin plan asignado lo dice y pide atención', () => {
    const r = subscriptionState({}, MIERCOLES);
    expect(r.status).toBe('sin_plan');
    expect(r.action).toBe('avisar');
  });

  it('con la fecha lejana está al día y no hay nada que hacer', () => {
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-09-15') }, MIERCOLES);
    expect(r.status).toBe('al_dia');
    expect(r.action).toBe('ninguna');
  });

  it('a menos de una semana avisa que está por vencer', () => {
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-08-10') }, MIERCOLES);
    expect(r.status).toBe('por_vencer');
    expect(r.action).toBe('avisar');
  });

  it('vencida ayer entra en gracia, no en mora', () => {
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-08-04') }, MIERCOLES);
    expect(r.status).toBe('en_gracia');
    expect(r.action).toBe('avisar');
    expect(r.daysOverdue).toBe(1);
    expect(r.graceDaysLeft).toBeGreaterThan(0);
  });

  it('el último día de gracia todavía NO corresponde bloquear', () => {
    // Venció el miércoles 29 de julio; 5 hábiles → miércoles 5 de agosto.
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-07-29') }, MIERCOLES);
    expect(r.status).toBe('en_gracia');
    expect(r.action).toBe('avisar');
  });

  it('pasado el plazo corresponde bloquear', () => {
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-07-20') }, MIERCOLES);
    expect(r.status).toBe('en_mora');
    expect(r.action).toBe('bloquear');
    expect(r.detail).toMatch(/plazo/i);
  });

  it('el fin de semana estira el plazo: no se bloquea antes de tiempo', () => {
    // Venció el viernes 31 de julio. Con 5 días NATURALES ya estaría
    // vencido el 5 de agosto; con 5 HÁBILES el plazo llega al 7.
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-07-31') }, MIERCOLES);
    expect(r.status).toBe('en_gracia');
    expect(r.graceUntil!.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('bloqueada manda sobre cualquier cálculo y ofrece desbloquear', () => {
    const r = subscriptionState(
      { ...plan, nextPaymentDate: dia('2026-07-01'), blockedAt: dia('2026-07-20') },
      MIERCOLES
    );
    expect(r.status).toBe('bloqueada');
    expect(r.action).toBe('desbloquear');
  });

  it('el aviso de bloqueo deja claro que no se pierde información', () => {
    const r = subscriptionState({ ...plan, nextPaymentDate: dia('2026-07-01'), blockedAt: dia('2026-07-20') }, MIERCOLES);
    expect(r.detail).toMatch(/se conserva/i);
  });

  it('con gracia de cero días, vencer ya es mora', () => {
    const r = subscriptionState({ planId: 'p1', graceDays: 0, nextPaymentDate: dia('2026-08-04') }, MIERCOLES);
    expect(r.status).toBe('en_mora');
  });
});

describe('nextPeriodEnd()', () => {
  it('suma el período del plan', () => {
    expect(nextPeriodEnd(dia('2026-08-05'), 'mensual').toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(nextPeriodEnd(dia('2026-08-05'), 'trimestral').toISOString().slice(0, 10)).toBe('2026-11-05');
    expect(nextPeriodEnd(dia('2026-08-05'), 'anual').toISOString().slice(0, 10)).toBe('2027-08-05');
  });

  it('un 31 en un mes de 30 se queda en el último día, no salta de mes', () => {
    expect(nextPeriodEnd(dia('2026-01-31'), 'mensual').toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(nextPeriodEnd(dia('2026-03-31'), 'mensual').toISOString().slice(0, 10)).toBe('2026-04-30');
  });
});
