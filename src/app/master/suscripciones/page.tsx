import { notFound } from 'next/navigation';
import { AlertTriangle, Ban, Clock, CheckCircle2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { listSubscriptions, listPlans } from '@/lib/services/subscriptions';
import { PERIOD_LABEL } from '@/lib/domain/subscription';
import { PageHeader } from '@/components/ui/page-header';
import { PlanCatalog } from './plan-catalog';
import { SubscriptionTable } from './subscription-table';

export const dynamic = 'force-dynamic';

/**
 * Suscripciones de la plataforma.
 *
 * Arriba lo que hay que atender hoy, ordenado por urgencia: primero a
 * quién corresponde bloquear, luego quién está dentro del plazo. Los
 * indicadores generales van después — al master le importa más qué
 * tiene que hacer que cuántas empresas tiene.
 */
export default async function SuscripcionesPage() {
  const session = await auth();
  if (session?.user.role !== 'master') notFound();

  const [suscripciones, planes] = await Promise.all([listSubscriptions(), listPlans()]);

  const aBloquear = suscripciones.filter((s) => s.state.action === 'bloquear');
  const enPlazo = suscripciones.filter((s) => s.state.status === 'en_gracia');
  const porVencer = suscripciones.filter((s) => s.state.status === 'por_vencer');
  const bloqueadas = suscripciones.filter((s) => s.state.status === 'bloqueada');
  const sinPlan = suscripciones.filter((s) => s.state.status === 'sin_plan');

  return (
    <div>
      <PageHeader
        title="Suscripciones"
        subtitle="Planes, cobros y estado de cada empresa administradora"
      />

      {/* ---------- Lo que hay que atender ---------- */}
      {(aBloquear.length > 0 || enPlazo.length > 0 || sinPlan.length > 0) && (
        <div className="mb-5 space-y-2">
          {aBloquear.length > 0 && (
            <Aviso
              tono="danger"
              icon={Ban}
              titulo={`${aBloquear.length} empresa(s) con el plazo agotado — corresponde bloquear`}
              detalle={aBloquear.map((s) => `${s.companyName} (${s.state.daysOverdue} días)`).join(' · ')}
            />
          )}
          {enPlazo.length > 0 && (
            <Aviso
              tono="warn"
              icon={Clock}
              titulo={`${enPlazo.length} empresa(s) con pago pendiente, dentro del plazo`}
              detalle={enPlazo
                .map((s) => `${s.companyName} (quedan ${s.state.graceDaysLeft} día(s) hábiles)`)
                .join(' · ')}
            />
          )}
          {sinPlan.length > 0 && (
            <Aviso
              tono="warn"
              icon={AlertTriangle}
              titulo={`${sinPlan.length} empresa(s) sin plan asignado`}
              detalle={sinPlan.map((s) => s.companyName).join(' · ')}
            />
          )}
        </div>
      )}

      {aBloquear.length === 0 && enPlazo.length === 0 && sinPlan.length === 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-ok-bg/60 px-4 py-3 text-sm text-ink">
          <CheckCircle2 size={16} className="text-ok" />
          Todas las empresas están al día. No hay nada que atender.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Empresas" valor={suscripciones.length} />
        <Kpi label="Al día" valor={suscripciones.filter((s) => s.state.status === 'al_dia').length} />
        <Kpi label="Por vencer" valor={porVencer.length} />
        <Kpi label="En plazo" valor={enPlazo.length} alerta={enPlazo.length > 0} />
        <Kpi label="Bloqueadas" valor={bloqueadas.length} alerta={bloqueadas.length > 0} />
      </div>

      <SubscriptionTable
        suscripciones={suscripciones.map((s) => ({
          companyId: s.companyId,
          companyName: s.companyName,
          planId: s.planId,
          planName: s.planName,
          price: s.price,
          currency: s.currency,
          period: PERIOD_LABEL[s.period] ?? s.period,
          maxCondominiums: s.maxCondominiums,
          condominiums: s.condominiums,
          nextPaymentDate: s.nextPaymentDate ? s.nextPaymentDate.toISOString().slice(0, 10) : null,
          lastPaymentAt: s.lastPaymentAt ? s.lastPaymentAt.toISOString() : null,
          status: s.state.status,
          label: s.state.label,
          detail: s.state.detail,
          action: s.state.action,
          blockReason: s.blockReason,
        }))}
        planes={planes.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          currency: p.currency,
          period: p.period,
          maxCondominiums: p.maxCondominiums,
          isActive: p.isActive,
        }))}
      />

      <PlanCatalog
        planes={planes.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          currency: p.currency,
          period: p.period,
          maxCondominiums: p.maxCondominiums,
          graceDays: p.graceDays,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
          empresas: p._count.companies,
        }))}
      />
    </div>
  );
}

function Aviso({
  tono,
  icon: Icon,
  titulo,
  detalle,
}: {
  tono: 'danger' | 'warn';
  icon: typeof Ban;
  titulo: string;
  detalle: string;
}) {
  const clases =
    tono === 'danger' ? 'border-danger/40 bg-danger-bg/50 text-danger' : 'border-warn/40 bg-warn-bg/50 text-warn';
  return (
    <div className={`card flex items-start gap-3 border p-4 ${clases}`}>
      <Icon size={18} className="mt-0.5 flex-none" />
      <div>
        <p className="text-sm font-bold">{titulo}</p>
        <p className="mt-0.5 text-xs text-ink">{detalle}</p>
      </div>
    </div>
  );
}

function Kpi({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`card p-4 ${alerta ? 'border-warn/50 bg-warn-bg/25' : ''}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink">{valor}</p>
    </div>
  );
}
