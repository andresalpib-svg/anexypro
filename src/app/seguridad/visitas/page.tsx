import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiums } from '@/lib/services/condominiums';
import { listVisits, accessDecision, isInside, hasFinished, deliveryOverstayed } from '@/lib/services/visits';
import { listPropertiesByCondo } from '@/lib/services/properties';
import { PageHeader } from '@/components/ui/page-header';
import { AutoRefresh } from '@/components/ui/auto-refresh';
import { SecurityCondoSelect } from '../condo-select';
import { Caseta, type CasetaVisit } from './caseta';

export default async function SecurityVisitsPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiums(session!.user.companyId);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <div className="card p-10 text-center text-sm text-muted">No hay condominios administrados todavía.</div>;

  const [visits, properties] = await Promise.all([
    listVisits(session!.user.companyId, condoId),
    listPropertiesByCondo(session!.user.companyId, condoId),
  ]);

  const serialized: CasetaVisit[] = visits.map((v) => {
    const inside = isInside(v);
    const finished = hasFinished(v);
    const decision = accessDecision(v);
    const last = v.checkins[v.checkins.length - 1];

    // Semáforo de caseta: azul dentro · verde autorizado · rojo
    // bloqueado/fuera de horario · amarillo pendiente/otro día.
    let semaforo: CasetaVisit['semaforo'];
    let estadoText: string;
    if (inside) {
      semaforo = 'azul';
      estadoText = deliveryOverstayed(v) ? 'DENTRO — permanencia excedida' : 'Dentro del condominio';
      if (deliveryOverstayed(v)) semaforo = 'rojo';
    } else if (finished && (v.visitType === 'rapida' || v.visitType === 'entrega')) {
      semaforo = 'neutro';
      estadoText = 'Finalizada';
    } else if (decision.allowed) {
      semaforo = 'verde';
      estadoText = decision.label;
    } else if (
      v.status === 'suspendida' ||
      v.status === 'vencida' ||
      v.status === 'cancelada' ||
      decision.reason.includes('FUERA DE HORARIO') ||
      decision.reason.includes('días permitidos')
    ) {
      semaforo = 'rojo';
      estadoText = decision.reason;
    } else {
      semaforo = 'amarillo';
      estadoText = decision.reason;
    }

    return {
      id: v.id,
      visitType: v.visitType,
      visitorName: v.visitorName,
      visitorIdNumber: v.visitorIdNumber,
      vehiclePlate: v.vehiclePlate,
      courier: v.courier,
      photoUrl: v.visitorPhotoUrl,
      propertyCode: v.property.code,
      code: v.code,
      schedules: v.schedules.map((s) => ({ dayOfWeek: s.dayOfWeek, startsAt: s.startsAt, endsAt: s.endsAt })),
      semaforo,
      estadoText,
      canEnter: decision.allowed,
      requiresOverride: !decision.allowed && 'requiresOverride' in decision && decision.requiresOverride,
      inside,
      openCheckinId: inside && last ? last.id : null,
      checkinAt: inside && last ? new Date(last.checkinAt).toISOString() : null,
    };
  });

  return (
    <div>
      <AutoRefresh seconds={10} />
      <PageHeader
        title="Control de Acceso"
        subtitle="Ingresos y salidas en dos toques — la pantalla se actualiza sola cada 10 segundos"
      />
      <SecurityCondoSelect condos={condos} selected={condoId} />
      <Caseta visits={serialized} properties={properties.map((p) => ({ id: p.id, code: p.code }))} condominiumId={condoId} />
    </div>
  );
}
