import { Wrench } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';

const STATUS_LABEL: Record<string, string> = { reportado: 'Reportado', programado: 'Programado', en_progreso: 'En progreso', completado: 'Completado', cancelado: 'Cancelado' };
const STATUS_VARIANT: Record<string, 'neutral' | 'warn' | 'royal' | 'ok' | 'danger'> = { reportado: 'neutral', programado: 'warn', en_progreso: 'royal', completado: 'ok', cancelado: 'danger' };

export default async function ResidentMaintenancePage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const tickets = await withTenantContext(session!.user.companyId, (tx) =>
    tx.maintenanceTicket.findMany(  {
      where: { condominiumId: ctx.condominium.id, publicVisible: true },
      orderBy: { createdAt: 'desc' },
      include: { asset: { select: { name: true } } },
    })
  );

  return (
    <div>
      <PageHeader title="Mantenimientos" subtitle="Mantenimiento realizado y en curso en tu condominio" />
      <div className="card divide-y divide-line">
        {tickets.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <Wrench className="mx-auto mb-2 text-muted" size={22} />
            Sin mantenimientos registrados todavía.
          </div>
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="p-4 text-sm">
              <div className="flex items-center gap-2">
                <p className="font-medium text-ink">{t.title}</p>
                <StatusChip variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</StatusChip>
              </div>
              <p className="mt-1 text-xs text-muted">
                {t.ticketType === 'preventivo' ? 'Preventivo' : 'Correctivo'}
                {t.asset && ` · ${t.asset.name}`}
              </p>
              {t.description && <p className="mt-1 text-ink">{t.description}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
