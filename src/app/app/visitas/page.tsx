import { DoorOpen, History } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listVisits } from '@/lib/services/visits';
import { listPropertiesByCondo } from '@/lib/services/properties';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { NewVisitForm } from './new-visit-form';
import { CheckInButton, CheckOutButton } from './check-buttons';

const TYPE_LABEL: Record<string, string> = { rapida: 'Rápida', recurrente: 'Recurrente', entrega: 'Entrega' };
const STATUS_LABEL: Record<string, string> = { vigente: 'Vigente', usada: 'Usada', vencida: 'Vencida', cancelada: 'Cancelada' };
const STATUS_VARIANT: Record<string, 'ok' | 'neutral' | 'danger'> = { vigente: 'ok', usada: 'neutral', vencida: 'danger', cancelada: 'danger' };

export default async function VisitasPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">Primero crea un condominio.</div>;

  const [visits, properties] = await Promise.all([
    listVisits(session!.user.companyId, condoId),
    listPropertiesByCondo(session!.user.companyId, condoId),
  ]);

  // "Por ingresar": la visita todavía no completó su ciclo (no ha salido).
  // "Ingresadas": ya registró ingreso Y salida — es el historial.
  const completed = (v: (typeof visits)[number]) => {
    const last = v.checkins[v.checkins.length - 1];
    return Boolean(last && last.checkoutAt);
  };
  const porIngresar = visits.filter((v) => !completed(v));
  const ingresadas = visits.filter(completed);

  return (
    <div>
      <PageHeader title="Control de Visitas" subtitle="Visitas rápidas, recurrentes y entregas" />
      <CondoSelect condos={condos} selected={condoId} />

      <div className="mt-5">
        <NewVisitForm condominiumId={condoId} properties={properties.map((p) => ({ id: p.id, code: p.code }))} />
      </div>

      <p className="mb-2 mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <DoorOpen size={14} /> Visitas por ingresar ({porIngresar.length})
      </p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Visitante</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {porIngresar.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  <DoorOpen className="mx-auto mb-2 text-muted" size={22} />
                  Sin visitas pendientes de ingreso.
                </td>
              </tr>
            ) : (
              porIngresar.map((v) => {
                const lastCheckin = v.checkins[v.checkins.length - 1];
                const isInside = lastCheckin && !lastCheckin.checkoutAt;
                return (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{v.visitorName}</td>
                    <td className="px-4 py-3 text-muted">{v.property.code}</td>
                    <td className="px-4 py-3 text-muted">{TYPE_LABEL[v.visitType]}</td>
                    <td className="px-4 py-3 font-mono text-xs">{v.code}</td>
                    <td className="px-4 py-3">
                      {isInside ? (
                        <StatusChip variant="ok">Adentro</StatusChip>
                      ) : (
                        <StatusChip variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</StatusChip>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.status === 'vigente' && !isInside && <CheckInButton authorizationId={v.id} />}
                      {isInside && lastCheckin && <CheckOutButton checkinId={lastCheckin.id} />}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mb-2 mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        <History size={14} /> Registro de visitas ingresadas ({ingresadas.length})
      </p>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Visitante</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Ingreso</th>
              <th className="px-4 py-3">Salida</th>
            </tr>
          </thead>
          <tbody>
            {ingresadas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  <History className="mx-auto mb-2 text-muted" size={22} />
                  Todavía no hay visitas con ingreso y salida completados.
                </td>
              </tr>
            ) : (
              ingresadas.map((v) => {
                const last = v.checkins[v.checkins.length - 1]!;
                return (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{v.visitorName}</td>
                    <td className="px-4 py-3 text-muted">{v.property.code}</td>
                    <td className="px-4 py-3 text-muted">{TYPE_LABEL[v.visitType]}</td>
                    <td className="px-4 py-3 text-muted">{new Date(last.checkinAt).toLocaleString('es-CR')}</td>
                    <td className="px-4 py-3 text-muted">
                      {last.checkoutAt ? new Date(last.checkoutAt).toLocaleString('es-CR') : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
