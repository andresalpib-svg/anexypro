import Link from 'next/link';
import { Building2, CheckCircle2, AlertTriangle, Home as HomeIcon, Gavel } from 'lucide-react';
import { auth } from '@/lib/auth';
import {
  getCompanyOverview,
  getCondosPendingSetup,
  getRecentActivity,
} from '@/lib/services/dashboard';
import { PageHeader } from '@/components/ui/page-header';
import { getSupervisorDashboard } from '@/lib/services/supervisor-dashboard';
import { SupervisorDashboard } from './supervisor-dashboard';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { resolveCondoId } from '@/lib/active-condo';
import { getViolationDashboard } from '@/lib/services/violation-followup';

export default async function DashboardPage() {
  const session = await auth();
  const companyId = session!.user.companyId;

  // El supervisor tiene su propio panel: lo que debe atender hoy en
  // sus condominios, no los indicadores de toda la empresa.
  if (session!.user.role === 'admin_staff') {
    const data = await getSupervisorDashboard(session!);
    return <SupervisorDashboard data={data} name={session!.user.name ?? 'Supervisor'} />;
  }

  const [overview, pendingSetup, activity] = await Promise.all([
    getCompanyOverview(companyId),
    getCondosPendingSetup(companyId),
    getRecentActivity(companyId),
  ]);

  // Incumplimientos del Condominio Activo: es lo que hay que atender
  // hoy, y desde aquí se llega al módulo en un clic.
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(undefined, condos);
  const violaciones = condoId ? await getViolationDashboard(companyId, condoId) : null;

  const condosCount = Number(overview?.condos_count ?? 0);
  const unitsCount = Number(overview?.units_count ?? 0);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${session!.user.companyId ? '' : ''}Resumen de tu operación`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi icon={Building2} color="bg-royal" label="Condominios administrados" value={condosCount} />
        <Kpi icon={HomeIcon} color="bg-lumen" label="Unidades totales" value={unitsCount} />
        <Kpi
          icon={AlertTriangle}
          color={pendingSetup.length ? 'bg-warn' : 'bg-ok'}
          label="En configuración"
          value={pendingSetup.length}
        />
      </div>

      {violaciones && (violaciones.abiertos > 0 || violaciones.mes > 0) && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink">
              <Gavel size={16} className="text-royal" /> Incumplimientos
            </h2>
            <Link href="/app/incumplimientos" className="text-sm font-semibold text-royal">
              Abrir el módulo
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniKpi label="Del mes" value={violaciones.mes} />
            <MiniKpi label="Casos abiertos" value={violaciones.abiertos} />
            <MiniKpi
              label="Próximos a vencer"
              value={violaciones.porVencer}
              alerta={violaciones.porVencer > 0}
            />
            <MiniKpi label="Multas aplicadas" value={violaciones.multas} />
          </div>
        </section>
      )}

      {condosCount === 0 && (
        <div className="card mt-6 flex flex-col items-center gap-3 p-14 text-center">
          <Building2 className="text-muted" size={32} />
          <p className="max-w-sm text-sm text-muted">
            Todavía no administras ningún condominio en esta empresa. Crea el primero para que el
            Dashboard empiece a mostrar datos reales.
          </p>
          <Link href="/app/condominios/nuevo" className="btn-primary mt-2">
            Crear el primer condominio
          </Link>
        </div>
      )}

      {pendingSetup.length > 0 && (
        <div className="card mt-6 flex items-start gap-3 border-warn/30 bg-warn-bg/40 p-5">
          <AlertTriangle className="mt-0.5 flex-none text-warn" size={20} />
          <div>
            <p className="text-sm font-semibold text-ink">
              {pendingSetup.length} condominio{pendingSetup.length === 1 ? '' : 's'} en configuración
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {pendingSetup.map((c) => c.name).join(', ')} todavía no {pendingSetup.length === 1 ? 'está activo' : 'están activos'} —
              complétalo{pendingSetup.length === 1 ? '' : 's'} para empezar a facturar.
            </p>
          </div>
        </div>
      )}

      <div className="card mt-6 p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Actividad reciente</p>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Sin actividad registrada todavía.</p>
        ) : (
          <ul className="divide-y divide-line">
            {activity.map((a) => (
              <li key={String(a.id)} className="flex items-center gap-3 py-2.5 text-sm">
                <CheckCircle2 size={15} className="flex-none text-muted" />
                <span className="text-ink">{a.description}</span>
                {a.property_code && <span className="text-muted">· {a.property_code}</span>}
                <span className="ml-auto flex-none text-xs text-muted">
                  {new Date(a.created_at).toLocaleDateString('es-CR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Building2;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="card p-5">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${color}`}>
        <Icon size={20} />
      </span>
      <p className="mt-3 font-sans text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-sm font-medium text-muted">{label}</p>
    </div>
  );
}

function MiniKpi({ label, value, alerta }: { label: string; value: number; alerta?: boolean }) {
  return (
    <div className={`card p-4 ${alerta ? 'border-warn/50 bg-warn-bg/30' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{value}</p>
    </div>
  );
}
