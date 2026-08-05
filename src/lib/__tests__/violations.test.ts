import { describe, it, expect } from 'vitest';
import {
  decideNextAction,
  applyAction,
  renderTemplate,
  daysBetweenDates,
  type ViolationPolicy,
  type CaseState,
} from '@/lib/domain/violations';

const HOY = new Date('2026-08-02T10:00:00Z');
const hace = (dias: number) => new Date(HOY.getTime() - dias * 86_400_000);

const RUIDO: ViolationPolicy = { warningsRequired: 2, daysBetween: 15, fineAmount: 25000, immediateFine: false };
const DANO: ViolationPolicy = { warningsRequired: 0, daysBetween: 0, fineAmount: 100000, immediateFine: true };
const CONSTRUCCION: ViolationPolicy = { warningsRequired: 1, daysBetween: 10, fineAmount: 50000, immediateFine: false };

describe('decideNextAction()', () => {
  it('sin expediente previo emite la primera advertencia', () => {
    const r = decideNextAction(RUIDO, null, HOY);
    expect(r.kind).toBe('advertencia');
    if (r.kind !== 'advertencia') return;
    expect(r.sequence).toBe(1);
    expect(r.remainingWarnings).toBe(1);
    expect(r.reason).toMatch(/primer incumplimiento/i);
  });

  it('con una advertencia emitida corresponde la segunda', () => {
    const state: CaseState = { warningsIssued: 1, fineIssued: false, lastActionAt: hace(20) };
    const r = decideNextAction(RUIDO, state, HOY);
    expect(r.kind).toBe('advertencia');
    if (r.kind !== 'advertencia') return;
    expect(r.sequence).toBe(2);
    expect(r.reason).toMatch(/segunda notificación/i);
  });

  it('agotadas las advertencias corresponde la multa', () => {
    const state: CaseState = { warningsIssued: 2, fineIssued: false, lastActionAt: hace(20) };
    const r = decideNextAction(RUIDO, state, HOY);
    expect(r.kind).toBe('multa');
    if (r.kind !== 'multa') return;
    expect(r.amount).toBe(25000);
    expect(r.reason).toMatch(/agotó/i);
  });

  it('multa inmediata salta las advertencias', () => {
    const r = decideNextAction(DANO, null, HOY);
    expect(r.kind).toBe('multa');
    if (r.kind !== 'multa') return;
    expect(r.amount).toBe(100000);
    expect(r.reason).toMatch(/inmediata/i);
  });

  it('un flujo de una sola advertencia multa en la segunda vuelta', () => {
    expect(decideNextAction(CONSTRUCCION, null, HOY).kind).toBe('advertencia');
    const tras = { warningsIssued: 1, fineIssued: false, lastActionAt: hace(11) };
    expect(decideNextAction(CONSTRUCCION, tras, HOY).kind).toBe('multa');
  });

  it('con la multa ya aplicada no queda nada por hacer', () => {
    const state: CaseState = { warningsIssued: 2, fineIssued: true, lastActionAt: hace(1) };
    const r = decideNextAction(RUIDO, state, HOY);
    expect(r.kind).toBe('ninguna');
    expect(r.reason).toMatch(/agotó el proceso/i);
  });

  it('avisa cuando el plazo entre acciones todavía no se cumple', () => {
    const state: CaseState = { warningsIssued: 1, fineIssued: false, lastActionAt: hace(3) };
    const r = decideNextAction(RUIDO, state, HOY);
    expect(r.tooSoon).toBe(true);
    expect(r.daysUntilAllowed).toBe(12); // 15 configurados - 3 transcurridos
  });

  it('cumplido el plazo exacto ya no avisa', () => {
    const state: CaseState = { warningsIssued: 1, fineIssued: false, lastActionAt: hace(15) };
    const r = decideNextAction(RUIDO, state, HOY);
    expect(r.tooSoon).toBe(false);
    expect(r.daysUntilAllowed).toBe(0);
  });

  it('sin advertencias configuradas multa de una vez, aunque no sea multa inmediata', () => {
    const politica: ViolationPolicy = { warningsRequired: 0, daysBetween: 0, fineAmount: 5000, immediateFine: false };
    expect(decideNextAction(politica, null, HOY).kind).toBe('multa');
  });

  it('tolera configuraciones con números negativos', () => {
    const rara: ViolationPolicy = { warningsRequired: -3, daysBetween: -10, fineAmount: 0, immediateFine: false };
    const r = decideNextAction(rara, null, HOY);
    expect(r.kind).toBe('multa');
    expect(r.tooSoon).toBe(false);
  });
});

describe('applyAction()', () => {
  it('la advertencia suma al contador y programa la siguiente', () => {
    const accion = decideNextAction(RUIDO, null, HOY);
    const r = applyAction(RUIDO, null, accion, HOY);
    expect(r.warningsIssued).toBe(1);
    expect(r.fineIssued).toBe(false);
    expect(r.status).toBe('abierto');
    expect(daysBetweenDates(HOY, r.nextActionDueAt!)).toBe(15);
  });

  it('la multa cierra el expediente y no deja acción siguiente', () => {
    const state: CaseState = { warningsIssued: 2, fineIssued: false, lastActionAt: hace(20) };
    const accion = decideNextAction(RUIDO, state, HOY);
    const r = applyAction(RUIDO, state, accion, HOY);
    expect(r.fineIssued).toBe(true);
    expect(r.status).toBe('cerrado');
    expect(r.nextActionDueAt).toBeNull();
    // La multa NO cuenta como advertencia.
    expect(r.warningsIssued).toBe(2);
  });

  it('la multa inmediata cierra el expediente en la primera acción', () => {
    const accion = decideNextAction(DANO, null, HOY);
    const r = applyAction(DANO, null, accion, HOY);
    expect(r.status).toBe('cerrado');
    expect(r.warningsIssued).toBe(0);
    expect(r.fineIssued).toBe(true);
  });
});

describe('renderTemplate()', () => {
  it('sustituye las variables conocidas', () => {
    const t = 'Estimado {propietario}, filial {filial} del condominio {condominio}.';
    expect(renderTemplate(t, { propietario: 'Ana Rojas', filial: 'CASA-13', condominio: 'Altamar' })).toBe(
      'Estimado Ana Rojas, filial CASA-13 del condominio Altamar.'
    );
  });

  it('deja en blanco lo que no se conoce en vez de imprimir el marcador', () => {
    expect(renderTemplate('Supervisor: {supervisor}.', {})).toBe('Supervisor: .');
  });

  it('no toca las llaves que no son variables', () => {
    expect(renderTemplate('Horario {8:00}', {})).toBe('Horario {8:00}');
  });
});
