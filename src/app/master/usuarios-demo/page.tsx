import { FlaskConical, Building2, User } from 'lucide-react';
import { listDemoCompanies } from '@/lib/services/demo';
import { listPlans } from '@/lib/services/subscriptions';
import { daysRemaining } from '@/lib/domain/demo-lifecycle';
import { evaluatePurgeEligibility } from '@/lib/domain/demo-cleanup';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { NewDemoUserForm } from './new-demo-form';
import { ReactivarDemoButton } from './reactivar-demo-button';
import { ConvertirDemoButton } from './convertir-demo-button';
import { PurgarDemoButton } from './purgar-demo-button';
import { HistorialDemoButton } from './historial-demo-button';

export const dynamic = 'force-dynamic';

const ESTADO_LABEL: Record<string, { label: string; variant: 'ok' | 'warn' | 'neutral' | 'danger' }> = {
  DEMO_ACTIVO: { label: 'Activa', variant: 'ok' },
  DEMO_VENCIDO: { label: 'Vencida', variant: 'warn' },
  DEMO_CONVERTIDO: { label: 'Convertida', variant: 'ok' },
  DEMO_ELIMINADO: { label: 'Eliminada', variant: 'neutral' },
  DEMO_CLEANUP_FAILED: { label: 'Limpieza fallida', variant: 'danger' },
};

/**
 * "Administración → Usuarios Demo" — alta asistida de cuentas demo
 * para un prospecto puntual, y el listado de todas las demo que
 * existen (las de acá y las que se crean solas desde /demo).
 */
export default async function UsuariosDemoPage() {
  const [demos, planesCrudos] = await Promise.all([listDemoCompanies(), listPlans(true)]);
  // `price` es Decimal de Prisma — no serializa a un componente cliente
  // sin convertirlo (mismo patrón que /master/suscripciones/page.tsx).
  const planes = planesCrudos.map((p) => ({ id: p.id, name: p.name, price: Number(p.price), currency: p.currency, period: p.period }));

  return (
    <div>
      <PageHeader
        title="Usuarios Demo"
        subtitle="Cuentas de prueba para prospectos — 15 días, se bloquean solas al vencer"
        action={<NewDemoUserForm />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {demos.map((d) => {
          const estado = d.demoStatus ? (ESTADO_LABEL[d.demoStatus] ?? { label: d.demoStatus, variant: 'neutral' as const }) : null;
          const dias = d.demoStatus === 'DEMO_ACTIVO' ? daysRemaining(d.demoExpiresAt, new Date()) : null;
          // PASO 9: ¿ya se puede purgar? Misma regla exacta que usa el
          // servidor en `purgeDemoDriveFiles` — acá solo decide si se
          // DIBUJA el botón o el aviso de "todavía no"; la comprobación
          // que de verdad importa se repite en el servidor.
          const purga = evaluatePurgeEligibility({
            isDemo: d.isDemo,
            demoStatus: d.demoStatus,
            demoDeleteScheduledAt: d.demoDeleteScheduledAt,
            now: new Date(),
          });

          return (
            <div key={d.companyId} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-royal text-white">
                  <FlaskConical size={20} />
                </span>
                <div className="flex flex-col items-end gap-1.5">
                  {estado && <StatusChip variant={estado.variant}>{estado.label}</StatusChip>}
                  {dias !== null && (
                    <span className="text-xs font-semibold text-muted">
                      Cuenta DEMO · {dias} día{dias === 1 ? '' : 's'} restante{dias === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-3 font-bold text-ink">{d.tradeName ?? d.legalName}</p>
              {d.condominiumName && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <Building2 size={12} /> {d.condominiumName}
                </p>
              )}

              <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
                <p>Inicio: {d.demoStartedAt ? d.demoStartedAt.toLocaleDateString('es-CR') : '—'}</p>
                <p>Vence: {d.demoExpiresAt ? d.demoExpiresAt.toLocaleDateString('es-CR') : '—'}</p>
                {d.demoStatus === 'DEMO_ELIMINADO' && (
                  <p>Archivos eliminados: {d.demoDeletedAt ? d.demoDeletedAt.toLocaleDateString('es-CR') : '—'}</p>
                )}
                <p className="flex items-center gap-1">
                  <User size={12} /> {d.demoCreatedByName ? `Creada por ${d.demoCreatedByName}` : 'Autoservicio (/demo)'}
                </p>
              </div>

              {/* Solo para DEMO_VENCIDO — el resto de los estados no la ofrece. */}
              {d.demoStatus === 'DEMO_VENCIDO' && (
                <ReactivarDemoButton companyId={d.companyId} clientName={d.tradeName ?? d.legalName} />
              )}

              {/* "Convertir a cuenta formal": mientras siga siendo demo
                  y tenga datos de verdad — activa o vencida, nunca ya
                  convertida (ni eliminada, cuando exista). */}
              {(d.demoStatus === 'DEMO_ACTIVO' || d.demoStatus === 'DEMO_VENCIDO') && (
                <ConvertirDemoButton companyId={d.companyId} clientName={d.tradeName ?? d.legalName} planes={planes} />
              )}

              {/* "Purgar archivos" (PASO 9): solo para VENCIDA (ya
                  pasado el día 18) o para reintentar una limpieza que
                  falló — nunca para ACTIVA, CONVERTIDA ni ya
                  ELIMINADA. Si está vencida pero todavía no llega el
                  día 18, un aviso en vez del botón explica cuándo. */}
              {(d.demoStatus === 'DEMO_VENCIDO' || d.demoStatus === 'DEMO_CLEANUP_FAILED') &&
                (purga.allowed ? (
                  <PurgarDemoButton
                    companyId={d.companyId}
                    clientName={d.tradeName ?? d.legalName}
                    retry={d.demoStatus === 'DEMO_CLEANUP_FAILED'}
                  />
                ) : (
                  <p className="mt-3 text-center text-xs text-muted">
                    Sus archivos se pueden purgar a partir del{' '}
                    {d.demoDeleteScheduledAt ? d.demoDeleteScheduledAt.toLocaleDateString('es-CR') : '—'}.
                  </p>
                ))}

              {/* PASO 11: disponible SIEMPRE, sin importar el estado —
                  incluida una demo ya eliminada o convertida. Es el
                  historial comercial permanente, no una acción del
                  ciclo de vida. */}
              <HistorialDemoButton companyId={d.companyId} clientName={d.tradeName ?? d.legalName} />
            </div>
          );
        })}
      </div>

      {demos.length === 0 && (
        <div className="card p-12 text-center text-sm text-muted">
          Todavía no hay cuentas demo. Creá una con el botón de arriba, o esperá a que alguien pida una
          desde /demo.
        </div>
      )}
    </div>
  );
}
