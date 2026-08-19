import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance } from '@/lib/services/finance';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../propiedades/condo-select';
import { StatementsTable } from './statements-table';

/**
 * Punto de entrada del módulo: elegí un condominio y ves SOLO las
 * filiales de ese condominio, con su saldo actual. `resolveCondoId`
 * valida el `condoId` de la URL contra `listCondominiumsForSession`
 * (que ya filtra por lo asignado al supervisor) — un `?condoId=` de
 * otro condominio de la misma empresa cae de vuelta al primero de la
 * lista permitida, nunca se usa tal cual.
 */
export default async function EstadosCuentaPage({
  searchParams,
}: {
  searchParams: { condoId?: string };
}) {
  const session = await auth();

  if (!can(session, 'finanzas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Estados de Cuenta</p>
        <p className="mt-1 text-sm text-muted">
          Tu cuenta de staff no tiene permiso para esta área. Pídele a un administrador que te lo
          otorgue desde Configuración.
        </p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  if (condos.length === 0) {
    return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;
  }

  const condoId = resolveCondoId(searchParams.condoId, condos)!;
  const condo = condos.find((c) => c.id === condoId)!;

  const properties = await listPropertiesWithBalance(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader
        title="Estados de Cuenta"
        subtitle="Consultá el estado de cuenta de cada filial, aplicá pagos y reenvialo por correo — un condominio y una filial a la vez"
      />

      <div className="flex flex-wrap items-center gap-3">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <StatementsTable
        condominiumId={condoId}
        currency={condo.currency}
        properties={properties.map((p) => ({
          id: p.id,
          code: p.code,
          propertyType: p.propertyType,
          ownerName: p.ownerName,
          balance: p.balance,
          suspended: p.suspended,
          hasPaymentPlan: p.hasPaymentPlan,
          monthsOverdue: p.monthsOverdue,
        }))}
      />
    </div>
  );
}
