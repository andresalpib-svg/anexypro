import { DoorOpen, Package as PackageIcon, AlertTriangle, Waves, Users, HardHat, Clock, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listVisits, getSecurityDashboard } from '@/lib/services/visits';
import { listIncidents, listPackages } from '@/lib/services/security';
import { listReservations } from '@/lib/services/reservations';
import { PageHeader } from '@/components/ui/page-header';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { SecurityCondoSelect } from '../condo-select';

export default async function SecurityDashboardPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const [visits, incidents, packages, reservations, access] = await Promise.all([
    listVisits(session!.user.companyId, condoId),
    listIncidents(session!.user.companyId, condoId),
    listPackages(session!.user.companyId, condoId),
    listReservations(session!.user.companyId, condoId),
    getSecurityDashboard(session!.user.companyId, condoId),
  ]);

  const today = new Date().toDateString();
  const entriesToday = visits.flatMap((v) => v.checkins).filter((c) => new Date(c.checkinAt).toDateString() === today).length;
  const pendingPackages = packages.filter((p) => p.status === 'recibido').length;
  const openIncidents = incidents.filter((i) => i.status !== 'cerrado').length;
  const todayReservations = reservations.filter((r) => new Date(r.resDate).toDateString() === today && r.status === 'confirmada').length;

  return (
    <div>
      <AutoRefresh seconds={15} />
      <PageHeader title="Dashboard" subtitle="Resumen del turno — se actualiza solo" />
      <SecurityCondoSelect condos={condos} selected={condoId} />

      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-muted">Control de acceso</p>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <Kpi icon={Users} color="bg-warn" label="Visitas esperadas hoy" value={access.expectedToday} />
        <Kpi icon={DoorOpen} color="bg-royal" label="Dentro del condominio" value={access.inside} />
        <Kpi icon={PackageIcon} color={access.deliveriesPendingExit ? 'bg-warn' : 'bg-ok'} label="Entregas sin salida" value={access.deliveriesPendingExit} />
        <Kpi icon={HardHat} color="bg-royal" label="Empleados presentes" value={access.employeesPresent} />
        <Kpi icon={ShieldAlert} color={access.outOfScheduleAttempts ? 'bg-danger' : 'bg-ok'} label="Ingresos fuera de horario (hoy)" value={access.outOfScheduleAttempts} />
        <Kpi icon={Clock} color="bg-royal" label="Permanencia promedio (min)" value={access.avgStayMinutes} />
        <Kpi icon={DoorOpen} color="bg-royal" label="Ingresos registrados hoy" value={entriesToday} />
        <Kpi icon={Waves} color="bg-royal" label="Reservas confirmadas hoy" value={todayReservations} />
      </div>

      <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-muted">Operación</p>
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <Kpi icon={PackageIcon} color={pendingPackages ? 'bg-warn' : 'bg-ok'} label="Paquetes pendientes" value={pendingPackages} />
        <Kpi icon={AlertTriangle} color={openIncidents ? 'bg-danger' : 'bg-ok'} label="Incidentes abiertos" value={openIncidents} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value }: { icon: typeof DoorOpen; color: string; label: string; value: number }) {
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
