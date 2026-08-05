import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { listPlatformUsers, listCompanies } from '@/lib/services/platform';
import { PageHeader } from '@/components/ui/page-header';
import { UserTable } from './user-table';

export const dynamic = 'force-dynamic';

/**
 * Usuarios de toda la plataforma.
 *
 * Es la pantalla para atender a alguien que llama porque no puede
 * entrar: se busca por nombre o correo, se ve su ficha —empresa, rol,
 * últimos intentos de acceso— y desde ahí se le restablece la
 * contraseña o se le reactiva el acceso.
 */
export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: { q?: string; empresa?: string; rol?: string; estado?: string };
}) {
  const session = await auth();
  if (session?.user.role !== 'master') notFound();

  const [usuarios, empresas] = await Promise.all([
    listPlatformUsers({
      texto: searchParams.q,
      companyId: searchParams.empresa,
      role: searchParams.rol,
      status: searchParams.estado,
    }),
    listCompanies(),
  ]);

  return (
    <div>
      <PageHeader
        title="Usuarios de la plataforma"
        subtitle="Buscar a cualquier usuario, ver su información y devolverle el acceso"
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block flex-1 min-w-[220px]">
          <span className="mb-1 block text-xs font-semibold text-muted">Nombre o correo</span>
          <input name="q" defaultValue={searchParams.q ?? ''} placeholder="Buscar…" className="field-input w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Empresa</span>
          <select name="empresa" defaultValue={searchParams.empresa ?? ''} className="field-input">
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.tradeName ?? e.legalName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Rol</span>
          <select name="rol" defaultValue={searchParams.rol ?? ''} className="field-input">
            <option value="">Todos</option>
            <option value="admin_owner">Administrador</option>
            <option value="admin_staff">Supervisor</option>
            <option value="contador">Contador</option>
            <option value="seguridad">Seguridad</option>
            <option value="condomino">Condómino</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Estado</span>
          <select name="estado" defaultValue={searchParams.estado ?? ''} className="field-input">
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="bloqueado">Bloqueados</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </label>
        <button type="submit" className="btn-primary">
          Buscar
        </button>
      </form>

      <UserTable
        usuarios={usuarios.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          status: u.status,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          companyName: u.company.tradeName ?? u.company.legalName,
        }))}
      />
    </div>
  );
}
