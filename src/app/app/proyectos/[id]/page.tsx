import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getProject } from '@/lib/services/projects';
import { canAccessCondo } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { ChecklistBox, UpdatesSection, StatusSelect } from './sections';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const project = await getProject(session!.user.companyId, params.id);
  if (!project) notFound();
  // Solo condominios asignados: la URL directa no salta la asignación.
  if (!(await canAccessCondo(session!, project.condominiumId))) notFound();

  const currency = project.condominium.currency;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={project.name}
        subtitle={project.description ?? undefined}
        action={
          <Link href="/app/proyectos" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <StatusSelect projectId={project.id} status={project.status} />
        <span className="text-sm text-muted">
          Presupuesto{' '}
          {new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(project.budget))}
        </span>
      </div>

      {/*
        Los hitos y el registro de gastos se quitaron de esta pantalla.
        El gasto de un proyecto es un gasto de la empresa y se registra
        en Finanzas, que es donde vive la aprobación por monto, el
        proveedor y el asiento contable — y es trabajo del contador, no
        de quien lleva el avance del proyecto.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChecklistBox projectId={project.id} items={project.checklist} />
        <UpdatesSection projectId={project.id} updates={project.updates} />
      </div>
    </div>
  );
}
