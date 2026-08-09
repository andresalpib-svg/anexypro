import QRCode from 'qrcode';
import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { listVisitsByProperty, getResidentVisitAlerts, isInside, hasFinished } from '@/lib/services/visits';
import { getPropertySuspension } from '@/lib/services/finance';
import { PageHeader } from '@/components/ui/page-header';
import { VisitManager, type PortalVisit } from './visit-manager';

const p2 = (n: number) => String(n).padStart(2, '0');
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
}

export default async function ResidentVisitsPage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  // Los avisos se derivan de la MISMA lista: antes cada uno hacía su
  // propia consulta y la pesada corría dos veces por carga.
  const [visits, suspension] = await Promise.all([
    listVisitsByProperty(session!.user.companyId, ctx.property.id),
    getPropertySuspension(session!.user.companyId, ctx.property.id),
  ]);
  const alerts = getResidentVisitAlerts(visits);

  const today = localToday();
  const serialized: PortalVisit[] = await Promise.all(
    visits.map(async (v) => {
      const inside = isInside(v);
      const finished = hasFinished(v);
      const dateStr = v.validDate ? new Date(v.validDate).toISOString().slice(0, 10) : null;

      let estado: PortalVisit['estado'];
      if (v.status === 'cancelada') estado = 'Cancelada';
      else if (v.status === 'suspendida') estado = 'Suspendida';
      else if (v.status === 'vencida') estado = 'Vencida';
      else if (inside) estado = 'Dentro del condominio';
      else if (finished && (v.visitType === 'rapida' || v.visitType === 'entrega')) estado = 'Finalizada';
      else if (v.visitType === 'empleado' && dateStr && dateStr > today) estado = 'Programado';
      else estado = 'Autorizada';

      const shareable = v.status === 'vigente' && !finished;
      return {
        id: v.id,
        visitType: v.visitType,
        visitorName: v.visitorName,
        visitorIdNumber: v.visitorIdNumber,
        vehiclePlate: v.vehiclePlate,
        courier: v.courier,
        relation: v.relation,
        photoUrl: v.visitorPhotoUrl,
        code: v.code,
        validDate: dateStr,
        arrivalTime: v.arrivalTime,
        endDate: v.endDate ? new Date(v.endDate).toISOString().slice(0, 10) : null,
        schedules: v.schedules.map((s) => ({ dayOfWeek: s.dayOfWeek, startsAt: s.startsAt, endsAt: s.endsAt })),
        estado,
        isToday: dateStr === today,
        qrDataUrl: shareable ? await QRCode.toDataURL(v.code, { width: 260, margin: 1 }) : null,
      };
    })
  );

  return (
    <div>
      <PageHeader
        title="Visitas y Control de Acceso"
        subtitle={`Entregas, visitas rápidas, recurrentes y empleados de ${ctx.property.code}`}
      />
      <VisitManager
        visits={serialized}
        condoName={ctx.condominium.name}
        alerts={alerts.map((a) => ({ id: a.id, kind: a.kind, text: a.text, when: a.when.toISOString() }))}
        suspension={{ suspended: suspension.suspended, monthsOverdue: suspension.monthsOverdue }}
      />
    </div>
  );
}
