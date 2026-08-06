import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listStaffUsers, listBoardCandidates, PERMISSION_AREAS, BOARD_AREAS } from '@/lib/services/settings';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { CondoSelect } from '../propiedades/condo-select';
import { PermissionCheckbox, BoardMemberToggle, BoardAreaCheckbox, InviteUserForm, PasswordManager } from './controls';

export default async function ConfiguracionPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (session?.user.role !== 'admin_owner') {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Solo el administrador principal</p>
        <p className="mt-1 text-sm text-muted">Usuarios, permisos y Junta Directiva son gestión exclusiva de admin_owner.</p>
      </div>
    );
  }

  const [staff, condos] = await Promise.all([listStaffUsers(session.user.companyId), listCondominiumsForSession(session)]);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const candidates = condoId ? await listBoardCandidates(session.user.companyId, condoId) : [];

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Usuarios, permisos y Junta Directiva" />

      <div className="mb-4">
        <InviteUserForm />
      </div>

      <div className="card mb-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-3">Usuario</th>
              {PERMISSION_AREAS.map((a) => (
                <th key={a.key} className="px-2 py-3 text-center">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2.5 font-medium text-ink">
                  {u.fullName}
                  {u.role === 'admin_owner' && <span className="ml-1 text-xs text-muted">(principal)</span>}
                </td>
                {PERMISSION_AREAS.map((a) => (
                  <td key={a.key} className="px-2 py-2.5 text-center">
                    {u.role === 'admin_owner' ? (
                      <span className="text-xs text-ok">✓</span>
                    ) : (
                      <PermissionCheckbox
                        userId={u.id}
                        area={a.key}
                        checked={(u.staffPermissions as Record<string, boolean> | null)?.[a.key] !== false}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-8">
        <PasswordManager />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Junta Directiva</p>
      <p className="mb-3 text-sm text-muted">
        No es un usuario ni un rol nuevo — es un conjunto de permisos de solo lectura sobre un
        propietario ya existente. Auditoría nunca aparece aquí como opción: es información operativa
        interna, no un reporte de transparencia hacia propietarios.
      </p>

      {condos.length === 0 ? (
        <p className="text-sm text-muted">Primero crea un condominio.</p>
      ) : (
        <>
          <CondoSelect condos={condos} selected={condoId!} />
          <div className="card mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3">Propietario</th>
                  <th className="px-3 py-3 text-center">Junta Directiva</th>
                  {BOARD_AREAS.map((a) => (
                    <th key={a} className="px-2 py-3 text-center capitalize">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={BOARD_AREAS.length + 2} className="px-3 py-8 text-center text-muted">
                      Sin propietarios registrados en este condominio todavía.
                    </td>
                  </tr>
                ) : (
                  candidates.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 font-medium text-ink">{p.fullName}</td>
                      <td className="px-3 py-2.5 text-center">
                        <BoardMemberToggle personId={p.id} checked={p.isBoardMember} />
                      </td>
                      {BOARD_AREAS.map((a) => (
                        <td key={a} className="px-2 py-2.5 text-center">
                          <BoardAreaCheckbox personId={p.id} area={a} checked={p.boardAreas.includes(a)} disabled={!p.isBoardMember} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
