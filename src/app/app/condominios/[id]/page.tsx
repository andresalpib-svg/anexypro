import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { requireOwner } from '@/lib/guard';
import {
  getCondominium,
  activateCondominium,
  listSupervisors,
  listAssignableUsers,
  MAX_SUPERVISORS,
  canAccessCondo,
} from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { SupervisorsCard } from '../supervisors-card';

const STATUS_LABEL: Record<string, string> = {
  configuracion: 'En configuración',
  activo: 'Activo',
  inactivo: 'Inactivo',
};

export default async function CondominioDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const condo = await getCondominium(session!.user.companyId, params.id);
  if (!condo) notFound();
  // Solo condominios asignados: la URL directa no salta la asignación.
  if (!(await canAccessCondo(session!, condo.id))) notFound();
  const [supervisors, staff] = await Promise.all([
    listSupervisors(session!.user.companyId, params.id),
    listAssignableUsers(session!.user.companyId),
  ]);

  async function handleActivate() {
    'use server';
    // Solo el administrador titular activa condominios — igual que
    // crearlos. Una action en línea es un endpoint HTTP como cualquiera.
    const s = await requireOwner();
    if (!s) return;
    await activateCondominium(s.user.companyId, params.id);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={condo.name}
        subtitle={`${condo.code} · ${condo._count.properties} unidades`}
        action={
          <Link href="/app/condominios" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <StatusChip variant={condo.status === 'activo' ? 'ok' : 'warn'}>
          {STATUS_LABEL[condo.status]}
        </StatusChip>
        {condo.status === 'configuracion' && (
          <form action={handleActivate}>
            <button type="submit" className="btn-primary py-1.5 text-xs">
              <CheckCircle2 size={14} /> Activar y empezar a facturar
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Datos generales</p>
          <dl className="space-y-2 text-sm">
            <Row label="Tipo" value={condo.type} />
            <Row label="Dirección" value={condo.addressLine ?? '—'} />
            <Row label="Provincia" value={condo.province ?? '—'} />
            <Row label="Cantón" value={condo.canton ?? '—'} />
            <Row label="Moneda" value={condo.currency} />
          </dl>
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
            Parámetros financieros
          </p>
          <dl className="space-y-2 text-sm">
            <Row
              label="Cuota ordinaria"
              value={
                condo.financialSettings
                  ? new Intl.NumberFormat('es-CR', {
                      style: 'currency',
                      currency: condo.currency,
                      maximumFractionDigits: 0,
                    }).format(Number(condo.financialSettings.baseFee))
                  : '—'
              }
            />
            <Row label="Día de vencimiento" value={String(condo.financialSettings?.dueDay ?? '—')} />
            <Row
              label="Suspende servicios tras"
              value={`${condo.financialSettings?.suspensionMonths ?? '—'} meses de atraso`}
            />
          </dl>
        </div>
      </div>

      <SupervisorsCard
        condominiumId={condo.id}
        supervisors={supervisors.map((s) => ({
          id: s.id,
          user: { id: s.user.id, fullName: s.user.fullName, email: s.user.email, role: s.user.role },
        }))}
        staff={staff}
        canManage={session!.user.role === 'admin_owner'}
        max={MAX_SUPERVISORS}
      />

      <div className="card mt-4 p-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          Estructura física y propiedades
        </p>
        <p className="text-sm text-muted">
          {condo.structuralUnits.length} torre(s)/etapa(s) registradas · {condo._count.properties}{' '}
          unidades. El asistente completo de estructura (torres, etapas, bloques) y el alta masiva de
          unidades siguen en construcción — por ahora, administra unidades individuales desde{' '}
          <Link href="/app/propiedades" className="font-semibold text-royal hover:underline">
            Propiedades
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
