import Link from 'next/link';
import { ListChecks, FileCheck2, Waves, MessageSquareWarning, Wrench, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import type { getSupervisorDashboard } from '@/lib/services/supervisor-dashboard';

type Data = Awaited<ReturnType<typeof getSupervisorDashboard>>;

const DOC_LABEL: Record<string, string> = {
  certificacion_al_dia: 'Certificación de cuotas al día',
  estado_cuenta: 'Estado de cuenta',
};

const PRIORITY_VARIANT: Record<string, 'neutral' | 'warn' | 'danger'> = {
  baja: 'neutral',
  media: 'warn',
  alta: 'danger',
};

const fecha = (d: Date) =>
  new Date(d).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Panel({
  icon: Icon,
  title,
  count,
  href,
  linkLabel,
  empty,
  children,
}: {
  icon: typeof ListChecks;
  title: string;
  count: number;
  href: string;
  linkLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Icon size={16} className="flex-none text-royal" />
        <p className="flex-1 text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
        <span className="rounded-full bg-royal-soft px-2 py-0.5 text-xs font-bold text-royal">{count}</span>
      </div>
      {count === 0 ? (
        <p className="flex-1 px-4 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex-1 divide-y divide-line">{children}</ul>
      )}
      <Link
        href={href}
        className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-xs font-semibold text-royal hover:bg-canvas"
      >
        {linkLabel} <ArrowRight size={13} />
      </Link>
    </div>
  );
}

/**
 * Vista del supervisor: qué tiene pendiente hoy, acotado a sus
 * condominios asignados. No muestra los indicadores de empresa del
 * panel de la administración.
 */
export function SupervisorDashboard({ data, name }: { data: Data; name: string }) {
  const { pendingTasks, documentRequests, pendingReservations, residentTickets, staffTickets, condos } = data;

  return (
    <div>
      <PageHeader
        title={`Hola, ${name.split(' ')[0]}`}
        subtitle={
          condos.length === 0
            ? 'Todavía no tienes condominios asignados — pídelo a la administración'
            : `${condos.length} condominio${condos.length === 1 ? '' : 's'} a tu cargo: ${condos.map((c) => c.name).join(' · ')}`
        }
      />

      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <Link href="/app/gestion" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-royal text-white">
            <ListChecks size={20} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{pendingTasks}</p>
          <p className="text-sm font-medium text-muted">Tareas pendientes</p>
        </Link>
        <Link href="/app/emision-documentos" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-lumen text-white">
            <FileCheck2 size={20} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{documentRequests.length}</p>
          <p className="text-sm font-medium text-muted">Certificaciones solicitadas</p>
        </Link>
        <Link href="/app/reservas" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-warn text-white">
            <Waves size={20} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">{pendingReservations.length}</p>
          <p className="text-sm font-medium text-muted">Reservas por aprobar</p>
        </Link>
        <Link href="/app/seguridad" className="card p-5">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-danger text-white">
            <MessageSquareWarning size={20} />
          </span>
          <p className="mt-3 font-sans text-xl font-bold text-ink">
            {residentTickets.length + staffTickets.length}
          </p>
          <p className="text-sm font-medium text-muted">Tickets abiertos</p>
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <Panel
          icon={FileCheck2}
          title="Certificaciones solicitadas"
          count={documentRequests.length}
          href="/app/emision-documentos"
          linkLabel="Ir a Emisión de Documentos"
          empty="Sin solicitudes pendientes."
        >
          {documentRequests.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{DOC_LABEL[r.docType] ?? r.docType}</p>
                <p className="truncate text-xs text-muted">
                  {r.property.code} · {r.person.fullName} · {r.condominium.name}
                </p>
              </div>
              <span className="flex-none text-xs text-muted">vence {fecha(r.dueBy)}</span>
            </li>
          ))}
        </Panel>

        <Panel
          icon={Waves}
          title="Reservas por aprobar"
          count={pendingReservations.length}
          href="/app/reservas"
          linkLabel="Ir a Reservas"
          empty="Sin reservas esperando aprobación."
        >
          {pendingReservations.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{r.amenity.name}</p>
                <p className="truncate text-xs text-muted">
                  {r.property?.code ?? 'Sin filial'} · {r.amenity.condominium.name}
                </p>
              </div>
              <span className="flex-none text-xs text-muted">{fecha(r.resDate)}</span>
            </li>
          ))}
        </Panel>

        <Panel
          icon={MessageSquareWarning}
          title="Tickets de residentes"
          count={residentTickets.length}
          href="/app/seguridad"
          linkLabel="Ver incidentes reportados"
          empty="Ningún residente tiene un ticket abierto."
        >
          {residentTickets.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{t.title}</p>
                <p className="truncate text-xs text-muted">
                  {t.condominium.name} · {fecha(t.createdAt)}
                </p>
              </div>
              <StatusChip variant={PRIORITY_VARIANT[t.priority] ?? 'neutral'}>{t.priority}</StatusChip>
            </li>
          ))}
        </Panel>

        <Panel
          icon={Wrench}
          title="Tickets creados por los oficiales"
          count={staffTickets.length}
          href="/app/mantenimiento"
          linkLabel="Ir a Mantenimientos de Áreas Comunes"
          empty="El personal no tiene tickets abiertos."
        >
          {staffTickets.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{t.title}</p>
                <p className="truncate text-xs text-muted">
                  {t.condominium.name} · {fecha(t.createdAt)}
                </p>
              </div>
              <StatusChip variant={PRIORITY_VARIANT[t.priority] ?? 'neutral'}>{t.priority}</StatusChip>
            </li>
          ))}
        </Panel>
      </div>
    </div>
  );
}
