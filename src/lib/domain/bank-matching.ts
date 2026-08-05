/**
 * Motor de conciliación bancaria — lógica pura, sin base de datos.
 *
 * Compara un movimiento del banco contra los candidatos del sistema
 * (pagos recibidos y pagos de gastos) y le asigna una CONFIANZA de 0
 * a 100. La confianza es lo que decide qué se concilia solo y qué
 * necesita un ojo humano:
 *
 *   >= 95  se concilia automáticamente
 *   70-94  se propone y basta un clic
 *   < 70   queda para revisión manual
 *
 * El umbral alto para lo automático es deliberado: una conciliación
 * equivocada ensucia la contabilidad y es difícil de detectar después.
 * Preferimos proponer de más que acertar de menos.
 */

export type BankTx = {
  id: string;
  date: Date;
  amount: number; // + entra, − sale
  description: string;
  reference?: string | null;
};

export type Candidate = {
  id: string;
  type: 'payment' | 'expense_payment';
  date: Date;
  amount: number; // siempre positivo
  reference?: string | null;
  /** Texto asociado: nombre de filial, proveedor o descripción. */
  label: string;
  /**
   * A QUIÉN pertenece el candidato: la filial que pagó o el proveedor
   * al que se le pagó.
   *
   * Es lo que hace útil el aprendizaje. Una regla no puede apuntar al
   * id del pago —ese id es de un movimiento único que nunca se
   * repite—, tiene que apuntar al dueño, que sí vuelve a pagar el mes
   * siguiente.
   */
  ownerId?: string | null;
};

export type MatchRule = {
  /** Fragmento normalizado del texto bancario. */
  pattern: string;
  targetType: string;
  targetId: string;
  timesUsed: number;
};

export type MatchScore = {
  candidate: Candidate;
  confidence: number;
  reasons: string[];
};

const MS_DAY = 86_400_000;

/**
 * Normaliza el texto del banco: mayúsculas, sin tildes, sin números y
 * sin relleno. Es lo que permite que "TRANSF SINPE JIMENEZ M 4471" y
 * "TRANSF SINPE JIMENEZ M 8890" se reconozcan como el mismo patrón.
 */
export function normalizeBankText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9]/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysApart(a: Date, b: Date): number {
  const x = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const y = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.abs(Math.round((x - y) / MS_DAY));
}

/** ¿La referencia del banco contiene la del sistema (o al revés)? */
function referenceMatches(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const x = clean(a);
  const y = clean(b);
  if (x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x);
}

/** ¿El nombre del candidato aparece en el texto del banco? */
function labelInDescription(label: string, description: string): boolean {
  const desc = normalizeBankText(description);
  const words = normalizeBankText(label)
    .split(' ')
    .filter((w) => w.length >= 4); // "DE", "LA", "SA" no distinguen nada
  if (words.length === 0) return false;
  const hits = words.filter((w) => desc.includes(w)).length;
  return hits / words.length >= 0.5;
}

export function scoreCandidate(tx: BankTx, candidate: Candidate, rules: MatchRule[] = []): MatchScore {
  const reasons: string[] = [];
  let confidence = 0;

  // --- Monto (la señal más fuerte) ---
  const txAbs = Math.abs(tx.amount);
  const diff = Math.abs(txAbs - candidate.amount);
  const relative = candidate.amount > 0 ? diff / candidate.amount : 1;

  if (diff < 0.01) {
    confidence += 40;
    reasons.push('monto exacto');
  } else if (relative <= 0.01) {
    confidence += 25;
    reasons.push('monto casi exacto');
  } else {
    // Sin coincidencia de monto no hay conciliación posible: se
    // devuelve 0 en vez de sumar señales débiles que den un falso
    // positivo.
    return { candidate, confidence: 0, reasons: ['el monto no coincide'] };
  }

  // --- Signo: un ingreso del banco no puede ser el pago de un gasto ---
  const expectedSign = candidate.type === 'payment' ? 1 : -1;
  if (Math.sign(tx.amount) !== expectedSign) {
    return { candidate, confidence: 0, reasons: ['el sentido del movimiento no corresponde'] };
  }

  // --- Fecha ---
  const days = daysApart(tx.date, candidate.date);
  if (days === 0) {
    confidence += 20;
    reasons.push('misma fecha');
  } else if (days <= 3) {
    confidence += 12;
    reasons.push(`${days} día(s) de diferencia`);
  } else if (days <= 10) {
    confidence += 5;
    reasons.push(`${days} días de diferencia`);
  } else {
    reasons.push(`${days} días de diferencia`);
  }

  // --- Referencia ---
  if (referenceMatches(tx.reference, candidate.reference)) {
    confidence += 25;
    reasons.push('la referencia coincide');
  }

  // --- Nombre dentro del texto del banco ---
  // Vale bastante: en Costa Rica las transferencias y SINPE llevan el
  // nombre de quien paga en el detalle del estado de cuenta, así que
  // monto exacto + nombre es una señal fuerte de verdad.
  if (labelInDescription(candidate.label, tx.description)) {
    confidence += 20;
    reasons.push(`el texto del banco menciona a ${candidate.label}`);
  }

  // --- Aprendizaje: patrón confirmado antes ---
  const normalized = normalizeBankText(tx.description);
  const rule = candidate.ownerId
    ? rules.find((r) => normalized.includes(r.pattern) && r.targetId === candidate.ownerId)
    : undefined;
  if (rule) {
    confidence += 15;
    reasons.push(`ya se conciliaron ${rule.timesUsed} movimiento(s) con este mismo texto`);
  }

  return { candidate, confidence: Math.min(100, confidence), reasons };
}

export type MatchDecision = {
  best: MatchScore | null;
  /** 'automatico' | 'propuesto' | 'manual' */
  action: 'automatico' | 'propuesto' | 'manual';
  /** Otros candidatos con puntaje, para que el humano elija. */
  alternatives: MatchScore[];
};

export const AUTO_THRESHOLD = 95;
export const PROPOSE_THRESHOLD = 70;

export function decideMatch(tx: BankTx, candidates: Candidate[], rules: MatchRule[] = []): MatchDecision {
  const scored = candidates
    .map((c) => scoreCandidate(tx, c, rules))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0] ?? null;
  if (!best) return { best: null, action: 'manual', alternatives: [] };

  // Empate técnico: si dos candidatos puntúan casi igual, NO se
  // concilia solo aunque supere el umbral — elegir el equivocado es
  // peor que preguntar.
  const second = scored[1];
  const ambiguous = Boolean(second && best.confidence - second.confidence < 10);

  let action: MatchDecision['action'] = 'manual';
  if (best.confidence >= AUTO_THRESHOLD && !ambiguous) action = 'automatico';
  else if (best.confidence >= PROPOSE_THRESHOLD) action = 'propuesto';

  return { best, action, alternatives: scored.slice(0, 5) };
}

/**
 * Huella del movimiento: identifica un movimiento bancario de forma
 * estable para que reimportar el mismo archivo no lo duplique.
 */
export function fingerprintOf(tx: {
  date: Date;
  amount: number;
  description: string;
  reference?: string | null;
}): string {
  const day = tx.date.toISOString().slice(0, 10);
  const amount = tx.amount.toFixed(2);
  const text = normalizeBankText(tx.description).slice(0, 60);
  const ref = (tx.reference ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${day}|${amount}|${text}|${ref}`;
}
