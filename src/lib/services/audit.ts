import { withTenantContext } from '@/lib/db';
import type { Prisma } from '@prisma/client';

/**
 * Bitácora de ACTIVIDAD legible para el administrador — distinta de
 * SystemAuditEntry (diff técnico de CRUD). Nunca se expone a la Junta
 * Directiva bajo ninguna circunstancia (ver Configuración/RBAC:
 * boardAreas nunca incluye 'auditoria', y esta página se gatea con
 * can(session,'auditoria'), no boardCan()).
 *
 * Recibe `tx` para poder llamarse DENTRO de la misma transacción que
 * la acción que audita — así el registro de auditoría nunca queda
 * huérfano si la acción principal falla y hace rollback.
 */
export async function logActivity(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: { userId: string; userName: string; module: string; action: string; target?: string }
) {
  return tx.auditLog.create({
    data: {
      companyId,
      userId: input.userId,
      userName: input.userName,
      module: input.module,
      action: input.action,
      target: input.target,
      device: 'Escritorio', // sin detección real de dispositivo todavía — ver limitaciones del README
    },
  });
}

export async function listAuditLog(companyId: string, moduleFilter?: string) {
  return withTenantContext(companyId, (tx) =>
    tx.auditLog.findMany({
      where: { companyId, ...(moduleFilter ? { module: moduleFilter } : {}) },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    })
  );
}

/**
 * Los módulos que aparecen en el filtro de Auditoría.
 *
 * DEBE contener todos los valores que se escriben como `module:` en las
 * llamadas a `logActivity`. Faltaban seis —Caja chica, Incumplimientos,
 * Plataforma, Residentes, Suscripción y Visitas—: esos movimientos SÍ
 * se registraban, pero no había forma de filtrarlos y desde la pantalla
 * parecía que nadie los auditaba.
 *
 * Si agregás un módulo nuevo a `logActivity`, agregalo también acá.
 */
export const AUDIT_MODULES = [
  'Asambleas',
  'Autenticación',
  'Caja chica',
  'Comunicados',
  'Condominios',
  'Configuración',
  'Documentos',
  'Finanzas',
  'Incumplimientos',
  'Mantenimiento',
  'Plataforma',
  'Proyectos',
  'Residentes',
  'Seguridad',
  'Suscripción',
  'Visitas',
];
