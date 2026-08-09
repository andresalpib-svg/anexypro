import Link from 'next/link';
import { Plus, FolderKanban, Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listProjects, projectSpent } from '@/lib/services/projects';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { KanbanBoard } from './kanban-board';

export default async function ProyectosPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'proyectos')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Proyectos</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const projects = condoId ? await listProjects(session!.user.companyId, condoId) : [];
  const condo = condos.find((c) => c.id === condoId);

  return (
    <div>
      <PageHeader
        title="Gestión de Proyectos"
        subtitle="Tablero de proyectos — arrastra cada tarjeta entre columnas para cambiar su estado"
        action={
          condoId && (
            <Link href={`/app/proyectos/nuevo?condoId=${condoId}`} className="btn-primary">
              <Plus size={16} /> Nuevo proyecto
            </Link>
          )
        }
      />

      {condos.length === 0 ? (
        <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />
      ) : (
        <>
          <CondoSelect condos={condos} selected={condoId!} />

          {projects.length === 0 ? (
            <div className="card mt-5 flex flex-col items-center gap-2 p-14 text-center">
              <FolderKanban className="text-muted" size={26} />
              <p className="text-sm text-muted">Sin proyectos todavía en este condominio.</p>
            </div>
          ) : (
            <KanbanBoard
              currency={condo?.currency ?? 'CRC'}
              projects={projects.map((p) => ({
                id: p.id,
                name: p.name,
                status: p.status,
                budget: p.budget.toString(),
                spent: projectSpent(p),
              }))}
            />
          )}
        </>
      )}
    </div>
  );
}
