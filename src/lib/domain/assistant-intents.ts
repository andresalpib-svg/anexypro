/**
 * Clasificación de la pregunta del administrador.
 *
 * Es DETERMINISTA a propósito: decide qué datos hay que ir a buscar a
 * la base. Si esta parte dependiera del modelo de lenguaje, una
 * respuesta podría construirse sobre los datos equivocados sin que
 * nadie lo note.
 */

export type Intent =
  | 'gastos_variacion'
  | 'morosidad'
  | 'proveedores'
  | 'presupuesto'
  | 'aprobaciones'
  | 'liquidez'
  | 'ingresos'
  | 'resumen';

type Rule = { intent: Intent; weight: number; terms: string[] };

/**
 * Cada regla suma puntos. Los términos son fragmentos: "moros" cubre
 * moroso, morosidad y morosos sin necesidad de listarlos.
 */
const RULES: Rule[] = [
  { intent: 'gastos_variacion', weight: 3, terms: ['aumentaron los gastos', 'subieron los gastos', 'por que gast'] },
  // Raíz "gast" en vez de la palabra completa: cubre gasto, gastos,
  // gastamos, gastó y gastar sin tener que enumerarlos.
  { intent: 'gastos_variacion', weight: 2, terms: ['gast', 'egreso', 'salida de dinero'] },
  { intent: 'gastos_variacion', weight: 2, terms: ['aumento', 'aumentar', 'subio', 'subieron', 'creci', 'variacion'] },

  { intent: 'morosidad', weight: 3, terms: ['moros', 'quien debe', 'quienes deben', 'atraso', 'atrasad'] },
  { intent: 'morosidad', weight: 2, terms: ['cobrar', 'cobrarle', 'cobranza', 'deuda', 'deben', 'cartera'] },

  { intent: 'proveedores', weight: 3, terms: ['proveedor', 'proveedores'] },
  { intent: 'proveedores', weight: 1, terms: ['a quien le pagamos', 'concentracion'] },

  { intent: 'presupuesto', weight: 3, terms: ['presupuesto', 'presupuestad', 'excedid', 'partida'] },

  { intent: 'aprobaciones', weight: 3, terms: ['aprobacion', 'aprobar', 'por aprobar', 'pendiente de aprob'] },
  { intent: 'aprobaciones', weight: 2, terms: ['autoriz'] },

  { intent: 'liquidez', weight: 3, terms: ['liquidez', 'efectivo', 'caja', 'flujo', 'alcanza la plata', 'solvencia'] },
  { intent: 'liquidez', weight: 2, terms: ['banco', 'saldo', 'mejorar'] },

  { intent: 'ingresos', weight: 3, terms: ['ingreso', 'ingresos', 'recaudo', 'recaudacion', 'cuanto entro'] },

  { intent: 'resumen', weight: 3, terms: ['resumen', 'como vamos', 'como esta', 'situacion general', 'panorama'] },
];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type Classification = { intent: Intent; confidence: number; matched: string[] };

export function classify(question: string): Classification {
  const q = normalize(question);
  if (!q) return { intent: 'resumen', confidence: 0, matched: [] };

  const scores = new Map<Intent, number>();
  const matched: string[] = [];

  for (const rule of RULES) {
    for (const term of rule.terms) {
      if (q.includes(normalize(term))) {
        scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
        matched.push(term);
      }
    }
  }

  if (scores.size === 0) return { intent: 'resumen', confidence: 0, matched: [] };

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [intent, score] = ranked[0]!;
  const total = [...scores.values()].reduce((s, v) => s + v, 0);

  return { intent, confidence: total > 0 ? score / total : 0, matched };
}

/** Preguntas sugeridas — son las del diseño, una por intención. */
export const SUGGESTED_QUESTIONS: { intent: Intent; text: string }[] = [
  { intent: 'gastos_variacion', text: '¿Por qué aumentaron los gastos este mes?' },
  { intent: 'morosidad', text: '¿Quiénes presentan mayor morosidad?' },
  { intent: 'proveedores', text: '¿Qué proveedores representan el mayor gasto?' },
  { intent: 'presupuesto', text: '¿Qué presupuesto está excedido?' },
  { intent: 'aprobaciones', text: '¿Qué pagos requieren aprobación?' },
  { intent: 'liquidez', text: '¿Cómo mejorar la liquidez?' },
];
