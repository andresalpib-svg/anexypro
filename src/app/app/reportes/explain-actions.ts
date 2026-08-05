'use server';

import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getFinancialReport, getDelinquencyReport, getMaintenanceReport, getProjectsReport } from '@/lib/services/reports';
import { explainReportData } from '@/lib/services/report-explainer';

export async function explainReportAction(tab: string) {
  const session = await auth();
  if (!session?.user || !can(session, 'reportes')) return 'Sin permiso.';
  const companyId = session.user.companyId;

  let dataText = '';
  if (tab === 'financiero') {
    const rows = await getFinancialReport(companyId);
    dataText = rows.map((r) => `${r.condoName}: facturado ${r.billed} ${r.currency}, recaudado ${r.collected} ${r.currency} (${r.pct}%)`).join('\n');
  } else if (tab === 'morosidad') {
    const rows = await getDelinquencyReport(companyId);
    dataText = rows.map((r) => `${r.propertyCode} (${r.condoName}): ${r.balance} ${r.currency}, ${r.daysOverdue} días de atraso`).join('\n');
  } else if (tab === 'mantenimiento') {
    const r = await getMaintenanceReport(companyId);
    dataText = `Tickets totales: ${r.total}. Preventivos: ${r.preventivos}. Completados: ${r.byStatus.completado ?? 0}. Costo acumulado: ${r.totalCost}.`;
  } else if (tab === 'proyectos') {
    const rows = await getProjectsReport(companyId);
    dataText = rows.map((p) => `${p.name} (${p.condoName}, ${p.status}): presupuesto ${p.budget} ${p.currency}, gastado ${p.spent} ${p.currency}`).join('\n');
  }

  if (!dataText.trim()) return 'Sin datos suficientes para explicar todavía.';
  return explainReportData(dataText);
}
