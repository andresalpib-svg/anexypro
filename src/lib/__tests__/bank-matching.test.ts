import { describe, it, expect } from 'vitest';
import {
  scoreCandidate,
  decideMatch,
  normalizeBankText,
  fingerprintOf,
  AUTO_THRESHOLD,
  type BankTx,
  type Candidate,
} from '@/lib/domain/bank-matching';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const deposito: BankTx = {
  id: 'tx1',
  date: d('2026-07-15'),
  amount: 75_000, // entra
  description: 'TRANSF SINPE JIMENEZ MORA LAURA 4471',
  reference: 'SINPE-889231',
};

const pagoLaura: Candidate = {
  id: 'p1',
  type: 'payment',
  date: d('2026-07-15'),
  amount: 75_000,
  reference: 'SINPE-889231',
  label: 'Laura Jiménez Mora',
  ownerId: 'casa-01',
};

describe('normalización del texto bancario', () => {
  it('quita números, tildes y relleno', () => {
    expect(normalizeBankText('TRANSF SINPE JIMÉNEZ M 4471')).toBe('TRANSF SINPE JIMENEZ M');
  });

  it('dos movimientos del mismo origen normalizan igual', () => {
    const a = normalizeBankText('TRANSF SINPE JIMENEZ M 4471');
    const b = normalizeBankText('TRANSF SINPE JIMENEZ M 8890');
    expect(a).toBe(b);
  });
});

describe('puntaje de coincidencia', () => {
  it('monto, fecha y referencia exactos concilian solos', () => {
    const s = scoreCandidate(deposito, pagoLaura);
    expect(s.confidence).toBeGreaterThanOrEqual(AUTO_THRESHOLD);
    expect(s.reasons).toContain('monto exacto');
    expect(s.reasons).toContain('la referencia coincide');
  });

  it('si el monto no coincide, el puntaje es cero', () => {
    const s = scoreCandidate(deposito, { ...pagoLaura, amount: 80_000 });
    expect(s.confidence).toBe(0);
  });

  // Esta es la protección más importante: un ingreso del banco nunca
  // puede ser el pago de un gasto.
  it('rechaza si el sentido del movimiento no corresponde', () => {
    const s = scoreCandidate(deposito, { ...pagoLaura, type: 'expense_payment' });
    expect(s.confidence).toBe(0);
    expect(s.reasons[0]).toMatch(/sentido/);
  });

  it('un egreso del banco sí concilia con un pago de gasto', () => {
    const egreso: BankTx = { ...deposito, amount: -485_000, description: 'PAGO PROVEEDOR SEGUROS DEL ISTMO' };
    const gasto: Candidate = {
      id: 'e1',
      type: 'expense_payment',
      date: d('2026-07-15'),
      amount: 485_000,
      label: 'Seguros del Istmo',
    };
    const s = scoreCandidate(egreso, gasto);
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.reasons).toContain('monto exacto');
  });

  it('baja el puntaje conforme se aleja la fecha', () => {
    const mismo = scoreCandidate(deposito, { ...pagoLaura, reference: null });
    const tresDias = scoreCandidate(deposito, { ...pagoLaura, reference: null, date: d('2026-07-18') });
    const veinteDias = scoreCandidate(deposito, { ...pagoLaura, reference: null, date: d('2026-08-04') });
    expect(mismo.confidence).toBeGreaterThan(tresDias.confidence);
    expect(tresDias.confidence).toBeGreaterThan(veinteDias.confidence);
  });

  it('reconoce el nombre dentro del texto del banco', () => {
    const s = scoreCandidate({ ...deposito, reference: null }, { ...pagoLaura, reference: null });
    expect(s.reasons.some((r) => /menciona/.test(r))).toBe(true);
  });

  // La regla apunta a la FILIAL, no al pago: un pago es único y nunca
  // se repite, así que una regla ligada a su id sería inútil desde el
  // segundo mes.
  it('el aprendizaje sube la confianza', () => {
    const sin = scoreCandidate({ ...deposito, reference: null }, { ...pagoLaura, reference: null });
    const con = scoreCandidate({ ...deposito, reference: null }, { ...pagoLaura, reference: null }, [
      { pattern: 'TRANSF SINPE JIMENEZ MORA LAURA', targetType: 'property', targetId: 'casa-01', timesUsed: 4 },
    ]);
    expect(con.confidence).toBeGreaterThan(sin.confidence);
  });
});

describe('aprendizaje ligado al dueño', () => {
  it('la regla aplica a un pago NUEVO de la misma filial', () => {
    const pagoDeAgosto: Candidate = { ...pagoLaura, id: 'p-nuevo', reference: null, date: d('2026-08-15') };
    const rules = [
      { pattern: 'TRANSF SINPE JIMENEZ MORA LAURA', targetType: 'property', targetId: 'casa-01', timesUsed: 6 },
    ];
    const con = scoreCandidate({ ...deposito, reference: null, date: d('2026-08-15') }, pagoDeAgosto, rules);
    const sin = scoreCandidate({ ...deposito, reference: null, date: d('2026-08-15') }, pagoDeAgosto, []);
    expect(con.confidence).toBeGreaterThan(sin.confidence);
  });

  it('la regla NO aplica a otra filial', () => {
    const otraFilial: Candidate = { ...pagoLaura, id: 'p9', ownerId: 'casa-99', reference: null };
    const rules = [
      { pattern: 'TRANSF SINPE JIMENEZ MORA LAURA', targetType: 'property', targetId: 'casa-01', timesUsed: 6 },
    ];
    const s = scoreCandidate({ ...deposito, reference: null }, otraFilial, rules);
    expect(s.reasons.some((r) => /ya se conciliaron/.test(r))).toBe(false);
  });
});

describe('decisión de conciliación', () => {
  it('concilia automáticamente cuando hay un único candidato claro', () => {
    const r = decideMatch(deposito, [pagoLaura]);
    expect(r.action).toBe('automatico');
  });

  // Protección contra el peor error posible: dos filiales que pagan lo
  // mismo el mismo día. Es mejor preguntar que adivinar.
  it('NO concilia solo si hay empate entre dos candidatos', () => {
    const otro: Candidate = { ...pagoLaura, id: 'p2', label: 'Laura Jiménez Mora', reference: 'SINPE-889231' };
    const r = decideMatch(deposito, [pagoLaura, otro]);
    expect(r.action).not.toBe('automatico');
    expect(r.alternatives.length).toBe(2);
  });

  it('propone cuando la confianza es media', () => {
    const parcial: Candidate = { ...pagoLaura, reference: null, date: d('2026-07-17') };
    const r = decideMatch({ ...deposito, reference: null }, [parcial]);
    expect(r.action).toBe('propuesto');
  });

  it('deja en manual cuando ningún candidato coincide', () => {
    const r = decideMatch(deposito, [{ ...pagoLaura, amount: 12_345 }]);
    expect(r.action).toBe('manual');
    expect(r.best).toBeNull();
  });

  it('ordena los candidatos de mayor a menor confianza', () => {
    const bueno = pagoLaura;
    const flojo: Candidate = { ...pagoLaura, id: 'p3', reference: null, label: 'Otro Residente', date: d('2026-07-22') };
    const r = decideMatch(deposito, [flojo, bueno]);
    expect(r.best?.candidate.id).toBe('p1');
  });
});

describe('huella anti-duplicado', () => {
  it('el mismo movimiento produce la misma huella', () => {
    const a = fingerprintOf({ date: d('2026-07-15'), amount: 75_000, description: 'TRANSF SINPE', reference: 'X1' });
    const b = fingerprintOf({ date: d('2026-07-15'), amount: 75_000, description: 'TRANSF SINPE', reference: 'X1' });
    expect(a).toBe(b);
  });

  it('movimientos distintos producen huellas distintas', () => {
    const a = fingerprintOf({ date: d('2026-07-15'), amount: 75_000, description: 'TRANSF SINPE' });
    const b = fingerprintOf({ date: d('2026-07-15'), amount: 75_001, description: 'TRANSF SINPE' });
    expect(a).not.toBe(b);
  });

  it('dos depósitos iguales el mismo día con referencia distinta NO se confunden', () => {
    const a = fingerprintOf({ date: d('2026-07-15'), amount: 75_000, description: 'TRANSF', reference: 'A1234' });
    const b = fingerprintOf({ date: d('2026-07-15'), amount: 75_000, description: 'TRANSF', reference: 'B5678' });
    expect(a).not.toBe(b);
  });
});
