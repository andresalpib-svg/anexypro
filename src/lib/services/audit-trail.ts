import type { Prisma } from '@prisma/client';
import { withTenantContext } from '@/lib/db';
import { clientIp } from '@/lib/rate-limit';

/**
 * Rastro de cambios de las operaciones sensibles: qué valía antes el
 * registro y qué vale ahora.
 *
 * `logActivity` (audit.ts) responde "quién, cuándo, qué acción, sobre
 * qué registro" y es lo que lee la pantalla de Auditoría. Lo que no
 * responde es "cuánto decía antes": si alguien cambia un presupuesto de
 * ₡2 000 000 a ₡200 000, la bitácora dice "presupuesto guardado" y el
 * valor viejo se pierde para siempre. Eso es justo lo que un auditor
 * necesita ver.
 *
 * El modelo `SystemAuditEntry` (tabla `audit_logs`) existía en el
 * esquema desde el inicio, con su columna `changes` y su RLS puesta,
 * pero NADIE escribía en él — estaba vacío en producción. Esta es la
 * función que lo llena.
 *
 * Va SIEMPRE dentro de la transacción de la operación que audita: si
 * la operación se revierte, su rastro se revierte con ella y nunca
 * queda un cambio registrado que no ocurrió.
 */

export type AuditAction = 'crear' | 'actualizar' | 'eliminar' | 'anular';

/**
 * Un campo que cambió. `antes` y `despues` se guardan tal cual se
 * muestran al usuario (número o texto), no como blobs de la fila
 * entera: el objetivo es que se lea sin herramientas.
 */
export type CambioCampo = { campo: string; antes: unknown; despues: unknown };

/** Compara dos versiones y devuelve solo los campos que de verdad cambiaron. */
export function diffCampos(
  antes: Record<string, unknown>,
  despues: Record<string, unknown>
): CambioCampo[] {
  const campos = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const salida: CambioCampo[] = [];
  for (const campo of campos) {
    const a = normalizar(antes[campo]);
    const d = normalizar(despues[campo]);
    if (a !== d) salida.push({ campo, antes: a, despues: d });
  }
  return salida;
}

/**
 * Los `Decimal` de Prisma y las fechas no se comparan bien con `!==`:
 * dos objetos distintos con el mismo valor darían "cambió". Se
 * normalizan a algo comparable y legible.
 */
function normalizar(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && 'toNumber' in (v as any)) return Number(v as any);
  return v;
}

export async function logChange(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: {
    /** Tabla o concepto afectado, en el vocabulario del negocio. */
    entity: string;
    entityId?: string | null;
    condominiumId?: string | null;
    action: AuditAction;
    userId?: string | null;
    /** Campos que cambiaron. Vacío en un alta o una baja completa. */
    cambios?: CambioCampo[];
    /** Fila completa al crear o al anular/eliminar — el "antes" de la baja. */
    snapshot?: Record<string, unknown> | null;
    /** Motivo declarado por quien ejecuta, cuando la operación lo pide. */
    motivo?: string | null;
  }
) {
  // Desde DÓNDE se hizo el cambio. Las columnas `ip` y `user_agent`
  // existían en el modelo desde el inicio y nadie las llenaba; para una
  // anulación de un movimiento financiero es justo el dato que se
  // pregunta después. Se leen de la petición en curso — `headers()`
  // falla fuera de una (un job, un guion de mantenimiento), y ahí
  // quedan nulas, que es la respuesta correcta: no hubo navegador.
  const origen = await leerOrigen();

  return tx.systemAuditEntry.create({
    data: {
      companyId,
      condominiumId: input.condominiumId ?? null,
      userId: input.userId ?? null,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action as any,
      ip: origen.ip,
      userAgent: origen.userAgent,
      changes: {
        ...(input.cambios?.length ? { cambios: input.cambios as any } : {}),
        ...(input.snapshot ? { snapshot: normalizarFila(input.snapshot) as any } : {}),
        ...(input.motivo ? { motivo: input.motivo } : {}),
      },
    },
  });
}

/**
 * IP y navegador de la petición en curso, si la hay.
 *
 * `next/headers` se importa de forma dinámica y dentro de un try: fuera
 * de una petición lanza, y este rastro no debe hacer fallar la
 * operación que audita. Un cambio sin origen es un cambio del sistema.
 */
async function leerOrigen(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const { headers } = await import('next/headers');
    const h = headers();
    return { ip: clientIp(h), userAgent: h.get('user-agent')?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

function normalizarFila(fila: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fila).map(([k, v]) => [k, normalizar(v)]));
}

/** Historial de cambios de un registro concreto, del más nuevo al más viejo. */
export async function listChanges(
  tx: Prisma.TransactionClient,
  companyId: string,
  entity: string,
  entityId: string
) {
  return tx.systemAuditEntry.findMany({
    where: { companyId, entity, entityId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { fullName: true } } },
  });
}

/**
 * Últimos cambios registrados de la empresa, para la pantalla de
 * Auditoría. Se acota a 200 como la bitácora de actividad: es una
 * pantalla de consulta reciente, no un export contable.
 */
export async function listRecentChanges(companyId: string, entity?: string) {
  return withTenantContext(companyId, (tx) =>
    tx.systemAuditEntry.findMany({
      where: { companyId, ...(entity ? { entity } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { fullName: true } } },
    })
  );
}

/** Nombre legible de cada cosa auditada — la tabla cruda no se le enseña a nadie. */
export const ENTIDAD_LABEL: Record<string, string> = {
  'budget_lines': 'Presupuesto',
  'charges': 'Cargo',
  'expenses': 'Gasto',
  'fund_movements': 'Movimiento de fondo',
  'petty_cash_expenses': 'Gasto de caja chica',
  'petty_cash_allocations': 'Asignación de caja chica',
  'users.staff_permissions': 'Permisos de usuario',
  'persons.board_areas': 'Áreas de Junta Directiva',
};

export const ACCION_LABEL: Record<string, string> = {
  crear: 'Creado',
  actualizar: 'Modificado',
  eliminar: 'Eliminado',
  anular: 'Anulado',
};
