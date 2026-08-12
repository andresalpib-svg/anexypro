/**
 * Ciclo de vida de una empresa DEMO (`Company.isDemo = true`).
 *
 * Funciones puras: reciben fechas, devuelven fechas o un estado — no
 * consultan la base ni escriben nada, así se prueban enteras. La hora
 * de partida (`start`) SIEMPRE tiene que venir del servidor (`new
 * Date()` en Node, o `now` de un job) — nunca de un valor que mande el
 * navegador, porque un reloj de cliente adelantado o atrasado correría
 * el vencimiento real de la demo.
 *
 * Regla de negocio (PASO 2):
 *   inicio + 15 días = vencimiento
 *   inicio + 18 días = eliminación programada (vencimiento + 3 días)
 *
 * La suma es en MILISEGUNDOS, no con `Date.setDate()`: son exactamente
 * 15×24 h desde el instante de inicio, sin depender de la zona horaria
 * del proceso ni de si hay un cambio de horario de por medio (a
 * diferencia de los "días hábiles" de la suscripción, que sí necesitan
 * trabajar en fechas de calendario — ver `domain/subscription.ts`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días de prueba antes de que la demo venza. */
export const DEMO_TRIAL_DAYS = 15;
/** Días de gracia ENTRE el vencimiento y la fecha programada de eliminación. */
export const DEMO_DELETE_GRACE_DAYS = 3;

export type DemoLifecycleDates = {
  /** Vence la demo: `start` + 15 días. */
  expiresAt: Date;
  /** A partir de esta fecha, un futuro proceso de limpieza PODRÍA
   * borrarla: `start` + 18 días. Hoy solo se guarda — nada la borra. */
  deleteScheduledAt: Date;
};

/** Calcula vencimiento y fecha de eliminación programada desde el inicio de la demo. */
export function demoLifecycleDates(start: Date): DemoLifecycleDates {
  const expiresAt = new Date(start.getTime() + DEMO_TRIAL_DAYS * DAY_MS);
  const deleteScheduledAt = new Date(expiresAt.getTime() + DEMO_DELETE_GRACE_DAYS * DAY_MS);
  return { expiresAt, deleteScheduledAt };
}

/**
 * Fase que le correspondería a una demo por el simple paso del tiempo,
 * ignorando hechos explícitos (convertida, eliminada). Es la mitad
 * "derivable" de `DemoStatus` — la usa el job `demo-vencidos` para
 * decidir a quién bloquear, y sirve para detectar una fila con
 * `demoStatus` desactualizado (activa en la base pero ya vencida por
 * fecha).
 *
 * Las otras 3 fases de `DemoStatus` (`DEMO_CONVERTIDO`,
 * `DEMO_ELIMINADO`, `DEMO_CLEANUP_FAILED`) son hechos explícitos que
 * alguien registra — no se derivan de ninguna fecha, así que esta
 * función nunca las devuelve.
 */
export function deriveTimeBasedPhase(
  expiresAt: Date | null | undefined,
  now: Date
): 'DEMO_ACTIVO' | 'DEMO_VENCIDO' {
  if (!expiresAt) return 'DEMO_ACTIVO';
  return now.getTime() >= expiresAt.getTime() ? 'DEMO_VENCIDO' : 'DEMO_ACTIVO';
}

/**
 * Días que le quedan a una demo, para el distintivo "Cuenta DEMO · X
 * días restantes". Redondea HACIA ARRIBA: a una hora de vencer todavía
 * le queda "1 día", no "0" — que leería como ya vencida sin estarlo
 * todavía. Nunca negativo: una demo vencida muestra 0, no un número
 * negativo que no significa nada para quien la usa.
 */
export function daysRemaining(expiresAt: Date | null | undefined, now: Date): number {
  if (!expiresAt) return 0;
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}
