import { History, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listAuditLog, AUDIT_MODULES } from '@/lib/services/audit';
import { listRecentChanges, ENTIDAD_LABEL, ACCION_LABEL } from '@/lib/services/audit-trail';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleFilter } from './module-filter';
import { AuditTabs } from './tabs';
import { ChangesTable } from './changes-table';

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: { module?: string; tab?: string };
}) {
  const session = await auth();

  // Auditoría NUNCA se otorga a la Junta Directiva bajo ninguna
  // circunstancia — can() ya lo respeta porque solo evalúa
  // staffPermissions (admin_owner/admin_staff), nunca boardAreas. Esta
  // página no tiene ninguna ruta de acceso vía boardCan().
  if (!can(session, 'auditoria')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Auditoría</p>
        <p className="mt-1 text-sm text-muted">Es información operativa interna de la administración.</p>
      </div>
    );
  }

  const tab = searchParams.tab === 'cambios' ? 'cambios' : 'actividad';

  // La pestaña de cambios responde lo que la de actividad no puede:
  // qué decía el registro ANTES. Son dos bitácoras distintas a
  // propósito —una legible para el día a día, otra con el detalle del
  // dato— y por eso no se mezclan en una sola tabla.
  if (tab === 'cambios') {
    const cambios = await listRecentChanges(session!.user.companyId);
    return (
      <div>
        <PageHeader title="Auditoría" subtitle="Historial de cambios — qué decía antes y qué dice ahora" />
        <AuditTabs tab={tab} />
        <ChangesTable
          rows={cambios.map((c) => ({
            id: String(c.id),
            createdAt: c.createdAt.toISOString(),
            userName: c.user?.fullName ?? 'Sistema (proceso automático)',
            entity: ENTIDAD_LABEL[c.entity] ?? c.entity,
            entityId: c.entityId,
            action: ACCION_LABEL[c.action] ?? c.action,
            changes: c.changes as Record<string, unknown> | null,
          }))}
        />
      </div>
    );
  }

  const entries = await listAuditLog(session!.user.companyId, searchParams.module);

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Historial de actividad — quién hizo qué, cuándo" />
      <AuditTabs tab={tab} />
      <ModuleFilter modules={AUDIT_MODULES} selected={searchParams.module} />

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Cuándo</th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Objeto</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  <History className="mx-auto mb-2 text-muted" size={22} />
                  Sin actividad registrada todavía.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-xs text-muted">{new Date(e.occurredAt).toLocaleString('es-CR')}</td>
                  <td className="px-4 py-2.5 text-ink">{e.userName}</td>
                  <td className="px-4 py-2.5 text-muted">{e.module}</td>
                  <td className="px-4 py-2.5 text-ink">{e.action}</td>
                  <td className="px-4 py-2.5 text-muted">{e.target ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
