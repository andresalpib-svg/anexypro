'use server';

import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getFinancialReport, getDelinquencyReport, getMaintenanceReport, getProjectsReport } from '@/lib/services/reports';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { explainReportData } from '@/lib/services/report-explainer';
import { hitRateLimit } from '@/lib/rate-limit';

export async function explainReportAction(tab: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'reportes')) return 'Sin permiso.';

  // Sin texto libre del usuario acá, pero igual frena el abuso de
  // costo de la API de Anthropic (auditoría de seguridad 2026-08-11,
  // hallazgo #20) contra alguien repitiendo el botón sin parar.
  const { allowed } = await hitRateLimit(`ia-reportes:${session.user.id}`, { max: 20, windowMs: 10 * 60_000 });
  if (!allowed) return 'Pediste muchas explicaciones seguidas — esperá unos minutos.';

  const companyId = session.user.companyId;
  // Mismo recorte que la pantalla (auditoría de seguridad 2026-08-11,
  // hallazgo #16): sin esto, "Explicar con IA" seguía narrando el
  // consolidado de TODA la empresa aunque la tabla ya estuviera
  // recortada a los condominios del supervisor.
  const condoIds = (await listCondominiumsForSession(session)).map((c) => c.id);

  let dataText = '';
  if (tab === 'financiero') {
    const rows = await getFinancialReport(companyId, condoIds);
    dataText = rows.map((r) => `${r.condoName}: facturado ${r.billed} ${r.currency}, recaudado ${r.collected} ${r.currency} (${r.pct}%)`).join('\n');
  } else if (tab === 'morosidad') {
    const rows = await getDelinquencyReport(companyId, condoIds);
    dataText = rows.map((r) => `${r.propertyCode} (${r.condoName}): ${r.balance} ${r.currency}, ${r.daysOverdue} días de atraso`).join('\n');
  } else if (tab === 'mantenimiento') {
    const r = await getMaintenanceReport(companyId, condoIds);
    dataText = `Tickets totales: ${r.total}. Preventivos: ${r.preventivos}. Completados: ${r.byStatus.completado ?? 0}. Costo acumulado: ${r.totalCost}.`;
  } else if (tab === 'proyectos') {
    const rows = await getProjectsReport(companyId, condoIds);
    dataText = rows.map((p) => `${p.name} (${p.condoName}, ${p.status}): presupuesto ${p.budget} ${p.currency}, gastado ${p.spent} ${p.currency}`).join('\n');
  }

  if (!dataText.trim()) return 'Sin datos suficientes para explicar todavía.';
  return explainReportData(dataText);
}
