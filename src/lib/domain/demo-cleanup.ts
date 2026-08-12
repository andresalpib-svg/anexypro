import type { DemoStatus } from '@prisma/client';

/**
 * Reglas puras de la limpieza física de una cuenta DEMO (PASO 9).
 *
 * Funciones puras: reciben el estado ya leído (de la base y del
 * proveedor), devuelven una DECISIÓN — nunca consultan ni escriben
 * nada, así se prueban enteras, igual que `domain/demo-lifecycle.ts`.
 * Quien hace I/O de verdad (leer la base, hablar con Drive, borrar)
 * es `services/demo-cleanup.ts`, que solo ORQUESTA lo que estas
 * funciones deciden.
 *
 * El criterio de fondo, en toda esta lógica: ante la duda, NO SE
 * BORRA. Un archivo que no se pudo identificar con absoluta certeza
 * como exclusivo de la demo se queda donde está, y la limpieza se
 * reporta como fallida — nunca al revés.
 */

// ============================================================
// Elegibilidad — ¿se puede purgar ESTA demo, ahora mismo?
// ============================================================

export type PurgeEligibilityInput = {
  isDemo: boolean;
  demoStatus: DemoStatus | null;
  /** Inicio + 15 días (vencimiento) + 3 días (gracia) = día 18. */
  demoDeleteScheduledAt: Date | null;
  now: Date;
  /**
   * Salta la comprobación de fecha — SOLO para pruebas manuales
   * controladas (el script `scripts/purgar-demo.ts` con `--force`).
   * Nunca la usa el flujo automático (que hoy ni siquiera existe,
   * ver nota en `jobs/index.ts`).
   */
  force?: boolean;
};

export type PurgeEligibility = { allowed: true } | { allowed: false; reason: string };

/**
 * ¿Corresponde purgar esta empresa? Esta función es la única puerta:
 * una empresa que no sea demo, o una demo `DEMO_CONVERTIDO` (ya es un
 * cliente real, tiene datos de verdad), NUNCA pasa de acá — sin
 * importar qué fecha traiga `demoDeleteScheduledAt`.
 */
export function evaluatePurgeEligibility(input: PurgeEligibilityInput): PurgeEligibility {
  if (!input.isDemo) {
    return { allowed: false, reason: 'Esa empresa no es una demo.' };
  }
  if (input.demoStatus === 'DEMO_CONVERTIDO') {
    return { allowed: false, reason: 'Esta cuenta se convirtió a cliente formal: nunca se purga.' };
  }
  if (input.demoStatus !== 'DEMO_VENCIDO' && input.demoStatus !== 'DEMO_CLEANUP_FAILED') {
    return {
      allowed: false,
      reason: `Solo se purga una demo VENCIDA o con una limpieza fallida previa (estado actual: ${input.demoStatus ?? 'sin estado'}).`,
    };
  }
  if (!input.force) {
    if (!input.demoDeleteScheduledAt || input.now.getTime() < input.demoDeleteScheduledAt.getTime()) {
      return {
        allowed: false,
        reason: `Todavía no llegó la fecha de eliminación programada (${
          input.demoDeleteScheduledAt ? input.demoDeleteScheduledAt.toISOString() : 'sin definir'
        }).`,
      };
    }
  }
  return { allowed: true };
}

/** Una demo ya purgada con éxito no vuelve a tocarse — idempotencia de una sola línea. */
export function isAlreadyPurged(demoStatus: DemoStatus | null): boolean {
  return demoStatus === 'DEMO_ELIMINADO';
}

// ============================================================
// Orden de borrado — hijos antes que padres
// ============================================================

export type CleanupFolderNode = {
  /** Fila `StorageFolder.id`. */
  id: string;
  /** Fila `StorageFolder.parentId` — DENTRO del árbol recolectado; `null` = raíz de la demo. */
  parentId: string | null;
};

/**
 * Ordena las carpetas de más profunda a menos profunda: las hojas
 * primero, la carpeta raíz de la demo al final. Es el único orden en
 * el que se puede ir borrando carpeta por carpeta sin depender de un
 * borrado en cascada del proveedor (cada `deleteFolderPermanently` se
 * llama sobre una carpeta que YA se comprobó vacía).
 *
 * Corte defensivo ante un ciclo corrupto en `parentId` (no debería
 * pasar nunca, pero un ciclo colgaría la función en vez de fallar
 * ruidosamente): al detectarlo, dejar de subir por esa cadena.
 */
export function orderFoldersDeepestFirst<T extends CleanupFolderNode>(folders: T[]): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const depthOf = (start: T): number => {
    let depth = 0;
    let cursor: CleanupFolderNode = start;
    const seen = new Set([start.id]);
    while (cursor.parentId && byId.has(cursor.parentId)) {
      const parent = byId.get(cursor.parentId)!;
      if (seen.has(parent.id)) break;
      seen.add(parent.id);
      cursor = parent;
      depth += 1;
    }
    return depth;
  };
  return [...folders].sort((a, b) => depthOf(b) - depthOf(a));
}

// ============================================================
// Decisión por elemento — ¿se puede borrar ESTE archivo/carpeta?
// ============================================================

export type OwnershipFacts = {
  /** `false` si el proveedor ya no tiene ese id. */
  exists: boolean;
  /** Padres reales que reporta el proveedor. */
  parents: string[];
  /** El proveedor lo marca como compartido con alguien más. */
  shared: boolean;
};

export type OwnershipDecision =
  | { action: 'ya_no_existía' }
  | { action: 'eliminar' }
  | { action: 'omitir'; motivo: string };

/**
 * Decide si un elemento (archivo o carpeta) es seguro de borrar, dado
 * lo que el proveedor reporta sobre su procedencia real. Es la
 * verificación de "no compartido con otra cuenta" y "el padre real
 * coincide con lo que dice la base" del enunciado — a nivel del
 * PROVEEDOR, no solo de la base de datos propia (esa exclusividad la
 * garantiza aparte el aislamiento por tenant al leer `StorageFolder`/
 * `StorageObject`, ver `services/demo-cleanup.ts`).
 */
export function evaluateOwnership(facts: OwnershipFacts, expectedParentProviderId: string): OwnershipDecision {
  if (!facts.exists) return { action: 'ya_no_existía' };
  if (facts.shared) {
    return { action: 'omitir', motivo: 'El proveedor lo reporta como compartido con otra cuenta.' };
  }
  if (facts.parents.length !== 1 || facts.parents[0] !== expectedParentProviderId) {
    return {
      action: 'omitir',
      motivo:
        facts.parents.length === 0
          ? 'El proveedor no reporta ningún padre para este recurso.'
          : facts.parents.length > 1
            ? `El proveedor reporta más de un padre (${facts.parents.length}): vive en otro lugar además del árbol de la demo.`
            : 'El padre real en el proveedor no coincide con el que registra la base de datos.',
    };
  }
  return { action: 'eliminar' };
}

/**
 * Última comprobación antes de borrar una carpeta: que el proveedor la
 * reporte REALMENTE vacía en este instante — no solo que la base de
 * datos crea que ya vació todo su contenido. Cualquier elemento vivo
 * que aparezca acá NO estaba en lo que se recolectó de la base, así
 * que por definición no se pudo verificar como exclusivo de la demo:
 * se detiene, nunca se borra en cascada.
 */
export function isFolderReallyEmpty(childrenReportedByProvider: { folders: unknown[]; files: unknown[] }): boolean {
  return childrenReportedByProvider.folders.length === 0 && childrenReportedByProvider.files.length === 0;
}

// ============================================================
// Resumen final — lo que pide auditar el enunciado
// ============================================================

export type CleanupItemOutcome = 'eliminado' | 'ya_no_existía' | 'omitido' | 'error';

export type CleanupItemResult = {
  kind: 'archivo' | 'carpeta';
  id: string;
  providerId: string;
  name: string;
  outcome: CleanupItemOutcome;
  motivo?: string;
};

export type CleanupSummary = {
  filesFound: number;
  filesDeleted: number;
  foldersFound: number;
  foldersDeleted: number;
  failed: CleanupItemResult[];
  /** `DEMO_ELIMINADO` si TODO se borró (o ya no existía); `DEMO_CLEANUP_FAILED` si algo quedó pendiente. */
  finalStatus: 'DEMO_ELIMINADO' | 'DEMO_CLEANUP_FAILED';
};

/**
 * Cuenta lo encontrado/eliminado/fallido y decide el estado final de
 * la demo. "Eliminado" cuenta tanto lo que se borró en esta corrida
 * como lo que YA no existía (reintentar una limpieza que fracasó a
 * medias no debe re-contar como fallo lo que un intento anterior sí
 * logró borrar).
 */
export function summarizeCleanup(results: CleanupItemResult[]): CleanupSummary {
  const archivos = results.filter((r) => r.kind === 'archivo');
  const carpetas = results.filter((r) => r.kind === 'carpeta');
  const failed = results.filter((r) => r.outcome === 'omitido' || r.outcome === 'error');
  const contarBorrado = (r: CleanupItemResult) => r.outcome === 'eliminado' || r.outcome === 'ya_no_existía';

  return {
    filesFound: archivos.length,
    filesDeleted: archivos.filter(contarBorrado).length,
    foldersFound: carpetas.length,
    foldersDeleted: carpetas.filter(contarBorrado).length,
    failed,
    finalStatus: failed.length === 0 ? 'DEMO_ELIMINADO' : 'DEMO_CLEANUP_FAILED',
  };
}
