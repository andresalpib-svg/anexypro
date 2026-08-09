import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Receipt } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getProject, projectSpent, EXPENSE_EXECUTED } from '@/lib/services/projects';
import { canAccessCondo } from '@/lib/services/condominiums';
import { STATUS_LABEL as EXPENSE_STATUS_LABEL } from '@/lib/services/expenses';
import { fechaSolo } from '@/lib/fecha-local';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { ChecklistBox, UpdatesSection, StatusSelect } from './sections';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const project = await getProject(session!.user.companyId, params.id);
  if (!project) notFound();
  // Solo condominios asignados: la URL directa no salta la asignación.
  if (!(await canAccessCondo(session!, project.condominiumId))) notFound();

  const currency = project.condominium.currency;
  const fmt = (n: number) =>
    new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const ejecutado = projectSpent(project);
  const presupuesto = Number(project.budget);
  const pct = presupuesto > 0 ? Math.round((ejecutado / presupuesto) * 100) : null;

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

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StatusSelect projectId={project.id} status={project.status} />
        <span className="text-sm text-muted">
          {ejecutado > 0 ? (
            <>
              <b className="text-ink">{fmt(ejecutado)}</b> ejecutado de {fmt(presupuesto)}
              {pct !== null && ` · ${pct}%`}
            </>
          ) : (
            <>Presupuesto {fmt(presupuesto)}</>
          )}
        </span>
      </div>

      {/*
        Los hitos y el REGISTRO de gastos se quitaron de esta pantalla: el
        gasto de un proyecto es un gasto de la empresa y se anota en
        Finanzas, donde viven la aprobación por monto, el proveedor y el
        asiento contable. Lo que sí vive acá es la LECTURA — una cifra de
        ejecución que no se puede abrir es una cifra que no se puede
        verificar.
      */}
      <div className="card mb-4">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
            <Receipt size={14} /> Gastos imputados ({project.financeExpenses.length})
          </p>
          <Link
            href={`/app/finanzas/gastos?condoId=${project.condominiumId}`}
            className="text-xs font-semibold text-royal hover:underline"
          >
            Registrar en Finanzas
          </Link>
        </div>
        {project.financeExpenses.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Todavía no hay gastos imputados a este proyecto. Al registrar un gasto en Finanzas,
            elegí este proyecto y su ejecución empieza a contarse acá.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {project.financeExpenses.map((e) => {
              const cuenta = (EXPENSE_EXECUTED as readonly string[]).includes(e.status);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">
                      #{e.expenseNumber} {e.description}
                    </span>
                    <span className="block text-xs text-muted">
                      {fechaSolo(e.issueDate)}
                      {e.supplier && ` · ${e.supplier.tradeName ?? e.supplier.legalName}`}
                    </span>
                  </span>
                  <StatusChip variant={cuenta ? 'ok' : 'neutral'}>
                    {EXPENSE_STATUS_LABEL[e.status] ?? e.status}
                  </StatusChip>
                  <span className={`flex-none font-sans font-bold ${cuenta ? 'text-ink' : 'text-muted'}`}>
                    {fmt(Number(e.total))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2 text-[.7rem] text-muted">
          Solo lo aprobado o pagado cuenta como ejecución — un gasto por aprobar todavía no
          compromete el presupuesto.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ChecklistBox projectId={project.id} items={project.checklist} />
        <UpdatesSection projectId={project.id} updates={project.updates} />
      </div>
    </div>
  );
}
