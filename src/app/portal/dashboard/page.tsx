import Link from 'next/link';
import { AlertTriangle, Receipt, Mail, Waves, DoorOpen, Gavel } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { getPropertyBalance, getPropertySuspension } from '@/lib/services/finance';
import { listMonthEvents, toMonthEvent, bucketEvents, eventSummaryItem } from '@/lib/services/calendar';
import { countUnreadNotices } from '@/lib/services/violations';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { MonthCalendar, SummaryRows } from '@/components/ui/month-calendar';

function parseMonth(mes?: string): { year: number; month: number } {
  const m = mes?.match(/^(\d{4})-(\d{2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function ResidentDashboardPage({ searchParams }: { searchParams: { mes?: string } }) {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null; // el layout ya maneja este caso
  const { year, month } = parseMonth(searchParams.mes);

  const [balance, suspension, unreadComms, myReservations, myVisits, monthEvents, unreadNotices] = await Promise.all([
    getPropertyBalance(session!.user.companyId, ctx.property.id),
    getPropertySuspension(session!.user.companyId, ctx.property.id),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.communicationRecipient.count(  { where: { personId: ctx.person.id, readAt: null } })
    ),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.reservation.count(  { where: { propertyId: ctx.property.id, status: { in: ['confirmada', 'pendiente_aprobacion'] }, resDate: { gte: new Date() } } })
    ),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.visitAuthorization.count(  { where: { propertyId: ctx.property.id, status: 'vigente' } })
    ),
    // Solo eventos para condóminos — los internos de la administración
    // nunca llegan a este portal.
    listMonthEvents(session!.user.companyId, ctx.condominium.id, year, month, 'condominos'),
    countUnreadNotices(session!.user.companyId, ctx.property.id),
  ]);

  // Resumen bajo el calendario: hoy / esta semana / este mes.
  const eventBuckets = bucketEvents(monthEvents);

  const fmt = (n: number) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: ctx.condominium.currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div>
      <PageHeader title={`Hola, ${ctx.person.fullName.split(' ')[0]}`} subtitle={`${ctx.condominium.name} · ${ctx.property.code}`} />

      {unreadNotices > 0 && (
        <Link
          href="/portal/incumplimientos"
          className="card mb-5 flex items-start gap-3 border-warn/40 bg-warn-bg/50 p-5 transition hover:border-warn"
        >
          <Gavel className="mt-0.5 flex-none text-warn" size={20} />
          <div>
            <p className="text-sm font-semibold text-ink">
              Tenés {unreadNotices} notificación{unreadNotices === 1 ? '' : 'es'} de incumplimiento sin leer
            </p>
            <p className="mt-0.5 text-sm text-muted">
              Abrila para ver el detalle, las fotografías y descargar el documento. Al terminar, confirmá la lectura.
            </p>
          </div>
        </Link>
      )}

      {suspension.suspended && (
        <div className="card mb-5 flex items-start gap-3 border-danger/30 bg-danger-bg/40 p-5">
          <AlertTriangle className="mt-0.5 flex-none text-danger" size={20} />
          <div>
            <p className="text-sm font-semibold text-ink">Servicios condominales suspendidos</p>
            <p className="mt-0.5 text-sm text-muted">
              Por {suspension.monthsOverdue} meses de atraso en la cuota condominal, tienes bloqueadas las
              reservas de áreas comunes, la autorización de visitas y el Árbitro Legal IA. Comunícate con
              la administración para revisar tu estado de cuenta.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/portal/estado-cuenta" className="card p-5">
          <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white ${balance > 0 ? 'bg-danger' : 'bg-ok'}`}>
            <Receipt size={20} />
          </span>
          <p className="mt-3 font-sans text-lg font-bold text-ink">{balance > 0 ? fmt(balance) : 'Al día'}</p>
          <p className="text-sm font-medium text-muted">Estado de cuenta</p>
        </Link>
        <Link href="/portal/comunicados" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-royal text-white">
            <Mail size={20} />
          </span>
          <p className="mt-3 font-sans text-lg font-bold text-ink">{unreadComms}</p>
          <p className="text-sm font-medium text-muted">Comunicados sin leer</p>
        </Link>
        <Link href="/portal/reservas" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-lumen text-white">
            <Waves size={20} />
          </span>
          <p className="mt-3 font-sans text-lg font-bold text-ink">{myReservations}</p>
          <p className="text-sm font-medium text-muted">Próximas reservas</p>
        </Link>
        <Link href="/portal/visitas" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-royal text-white">
            <DoorOpen size={20} />
          </span>
          <p className="mt-3 font-sans text-lg font-bold text-ink">{myVisits}</p>
          <p className="text-sm font-medium text-muted">Visitas autorizadas</p>
        </Link>
      </div>

      <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-muted">Calendario de tu condominio</p>
      <MonthCalendar
        year={year}
        month={month}
        prevHref={`/portal/dashboard?mes=${new Date(year, month - 2, 1).getFullYear()}-${String(new Date(year, month - 2, 1).getMonth() + 1).padStart(2, '0')}`}
        nextHref={`/portal/dashboard?mes=${new Date(year, month, 1).getFullYear()}-${String(new Date(year, month, 1).getMonth() + 1).padStart(2, '0')}`}
        events={monthEvents.map(toMonthEvent)}
      />
      <SummaryRows
        rows={[
          { label: 'Hoy', items: eventBuckets.hoy.map(eventSummaryItem) },
          { label: 'Esta semana', items: eventBuckets.semana.map(eventSummaryItem) },
          { label: 'Este mes', items: eventBuckets.mes.map(eventSummaryItem) },
        ]}
      />
    </div>
  );
}
