/**
 * Motor de flujo disciplinario.
 *
 * Decide qué corresponde emitir cuando alguien reporta un
 * incumplimiento: la primera advertencia, la segunda, o ya la multa.
 *
 * **No hay reglas fijas.** Todo sale de la configuración del tipo de
 * incumplimiento: cuántas advertencias exige, cuántos días deben pasar
 * entre una y otra, y si la falta va directo a multa. Un condominio
 * puede tener "Ruido" con dos advertencias antes de multar y "Daño a
 * áreas comunes" con multa inmediata, sin que eso toque el código.
 *
 * Es una función pura: recibe la configuración y el estado del
 * expediente, y devuelve la decisión. No consulta la base ni escribe
 * nada, así que se puede probar entera y la pantalla puede mostrar de
 * antemano qué va a pasar antes de que el usuario confirme.
 */

export type ViolationPolicy = {
  /** Advertencias que hay que agotar antes de la multa. */
  warningsRequired: number;
  /** Días que deben transcurrir entre una acción y la siguiente. */
  daysBetween: number;
  fineAmount: number;
  /** Salta las advertencias: la primera acción ya es la multa. */
  immediateFine: boolean;
};

/** Estado del expediente abierto para esa filial y ese tipo, si existe. */
export type CaseState = {
  warningsIssued: number;
  fineIssued: boolean;
  lastActionAt: Date | null;
};

export type NextAction =
  | {
      kind: 'advertencia';
      sequence: number;
      /** Cuántas advertencias quedan después de esta. */
      remainingWarnings: number;
      label: string;
      reason: string;
      /** Fecha a partir de la cual corresponde la siguiente acción. */
      dueAt: Date | null;
      /** El plazo entre acciones todavía no se cumple. */
      tooSoon: boolean;
      daysUntilAllowed: number;
    }
  | {
      kind: 'multa';
      sequence: 1;
      amount: number;
      label: string;
      reason: string;
      dueAt: null;
      tooSoon: boolean;
      daysUntilAllowed: number;
    }
  | {
      kind: 'ninguna';
      label: string;
      reason: string;
      dueAt: null;
      tooSoon: false;
      daysUntilAllowed: 0;
    };

const DIA = 86_400_000;

function ordinal(n: number): string {
  const nombres = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta'];
  return nombres[n - 1] ?? `${n}.ª`;
}

/** Días completos entre dos fechas (positivo si `b` es posterior). */
export function daysBetweenDates(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DIA);
}

/**
 * Qué corresponde emitir ahora.
 *
 * `state` en null significa que la filial no tiene expediente abierto
 * por este incumplimiento: es la primera vez.
 */
export function decideNextAction(
  policy: ViolationPolicy,
  state: CaseState | null,
  now: Date = new Date()
): NextAction {
  const warningsRequired = Math.max(0, Math.floor(policy.warningsRequired));
  const daysBetween = Math.max(0, Math.floor(policy.daysBetween));

  // ¿Se cumplió el plazo desde la última acción?
  const transcurridos = state?.lastActionAt ? daysBetweenDates(state.lastActionAt, now) : Infinity;
  const faltan = Number.isFinite(transcurridos) ? Math.max(0, daysBetween - transcurridos) : 0;
  const tooSoon = faltan > 0;

  // Multa inmediata: la configuración manda y no hay advertencias.
  if (policy.immediateFine) {
    if (state?.fineIssued) {
      return {
        kind: 'ninguna',
        label: 'Sin acción pendiente',
        reason: 'Este incumplimiento ya tiene la multa aplicada. El expediente está cerrado.',
        dueAt: null,
        tooSoon: false,
        daysUntilAllowed: 0,
      };
    }
    return {
      kind: 'multa',
      sequence: 1,
      amount: policy.fineAmount,
      label: 'Aplicar multa',
      reason: 'Este incumplimiento está configurado para aplicar la multa de forma inmediata, sin advertencias previas.',
      dueAt: null,
      tooSoon,
      daysUntilAllowed: faltan,
    };
  }

  const emitidas = state?.warningsIssued ?? 0;

  if (state?.fineIssued) {
    return {
      kind: 'ninguna',
      label: 'Sin acción pendiente',
      reason: 'Esta filial ya agotó el proceso: se emitieron las advertencias y se aplicó la multa.',
      dueAt: null,
      tooSoon: false,
      daysUntilAllowed: 0,
    };
  }

  // Todavía quedan advertencias por emitir.
  if (emitidas < warningsRequired) {
    const sequence = emitidas + 1;
    const restantes = warningsRequired - sequence;
    return {
      kind: 'advertencia',
      sequence,
      remainingWarnings: restantes,
      label: `Emitir ${ordinal(sequence)} notificación`,
      reason:
        emitidas === 0
          ? 'Es el primer incumplimiento de este tipo registrado para esta filial.'
          : `Esta filial ya recibió ${emitidas === 1 ? 'una advertencia' : `${emitidas} advertencias`} por este incumplimiento. Corresponde emitir la ${ordinal(sequence)} notificación.`,
      dueAt: new Date(now.getTime() + daysBetween * DIA),
      tooSoon,
      daysUntilAllowed: faltan,
    };
  }

  // Advertencias agotadas: toca la multa.
  return {
    kind: 'multa',
    sequence: 1,
    amount: policy.fineAmount,
    label: 'Aplicar multa',
    reason:
      warningsRequired === 0
        ? 'Este incumplimiento no exige advertencias previas.'
        : `Esta filial agotó las ${warningsRequired === 1 ? 'advertencia' : `${warningsRequired} advertencias`} configuradas. Corresponde aplicar la multa.`,
    dueAt: null,
    tooSoon,
    daysUntilAllowed: faltan,
  };
}

/**
 * Cómo queda el expediente después de emitir la acción.
 *
 * Se calcula aquí y no en el servicio para que la transición de estado
 * viva junto a la decisión que la produjo — y se pueda probar igual.
 */
export function applyAction(
  policy: ViolationPolicy,
  state: CaseState | null,
  action: NextAction,
  now: Date = new Date()
): {
  warningsIssued: number;
  fineIssued: boolean;
  status: 'abierto' | 'cerrado';
  lastActionAt: Date;
  nextActionDueAt: Date | null;
} {
  const previo = state ?? { warningsIssued: 0, fineIssued: false, lastActionAt: null };

  if (action.kind === 'multa') {
    return {
      warningsIssued: previo.warningsIssued,
      fineIssued: true,
      // La multa cierra el ciclo: no hay más escalamiento configurado.
      status: 'cerrado',
      lastActionAt: now,
      nextActionDueAt: null,
    };
  }

  if (action.kind === 'advertencia') {
    const warningsIssued = previo.warningsIssued + 1;
    return {
      warningsIssued,
      fineIssued: previo.fineIssued,
      status: 'abierto',
      lastActionAt: now,
      // La siguiente acción se habilita cuando pase el plazo configurado.
      nextActionDueAt: new Date(now.getTime() + Math.max(0, policy.daysBetween) * DIA),
    };
  }

  return {
    warningsIssued: previo.warningsIssued,
    fineIssued: previo.fineIssued,
    status: 'cerrado',
    lastActionAt: previo.lastActionAt ?? now,
    nextActionDueAt: null,
  };
}

/**
 * Sustituye las variables de la plantilla.
 *
 * Las que no se conocen se dejan en blanco en vez de imprimir el
 * marcador: un documento que le llega al condómino con `{supervisor}`
 * en el texto es peor que uno sin esa línea.
 */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, clave: string) => vars[clave] ?? '');
}

/** Variables que admiten las plantillas, para mostrarlas en la pantalla de configuración. */
export const TEMPLATE_VARS = [
  { key: 'propietario', desc: 'Nombre del propietario' },
  { key: 'filial', desc: 'Número o código de la filial' },
  { key: 'condominio', desc: 'Nombre del condominio' },
  { key: 'fecha', desc: 'Fecha de emisión' },
  { key: 'hora', desc: 'Hora de emisión' },
  { key: 'supervisor', desc: 'Supervisor que reporta' },
  { key: 'administrador', desc: 'Administración a cargo' },
  { key: 'articulo', desc: 'Artículo del reglamento' },
  { key: 'incumplimiento', desc: 'Tipo de incumplimiento' },
  { key: 'observacion', desc: 'Observación escrita al reportar' },
  { key: 'monto', desc: 'Monto de la multa' },
  { key: 'consecutivo', desc: 'Número de expediente' },
  { key: 'plazo', desc: 'Días de plazo para atender el aviso' },
  { key: 'fechaPrimera', desc: 'Fecha de la primera notificación (2.ª en adelante)' },
  { key: 'horaPrimera', desc: 'Hora de la primera notificación (2.ª en adelante)' },
  { key: 'consecuencia', desc: 'Qué ocurre si reincide, según el escalamiento configurado' },
] as const;
