import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  getFinancialReport,
  getDelinquencyReport,
  getMaintenanceReport,
  getProjectsReport,
} from '@/lib/services/reports';
import { getViolationReport } from '@/lib/services/violation-followup';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { resolveCondoId } from '@/lib/active-condo';

const STATUS_LABEL: Record<string, string> = {
  reportado: 'Reportado',
  programado: 'Programado',
  en_progreso: 'En progreso',
  completado: 'Completado',
  cancelado: 'Cancelado',
  planificado: 'Planificado',
  pausado: 'Pausado',
};

/**
 * Descarga del reporte activo en formato Excel real (.xlsx, no CSV).
 * Mismos datos y mismos servicios que la pantalla — sin duplicar
 * lógica de negocio, solo cambia el formato de salida.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!can(session, 'reportes')) return new Response('Sin acceso a Reportes', { status: 403 });

  const tab = req.nextUrl.searchParams.get('tab') ?? 'financiero';
  const companyId = session!.user.companyId;

  let sheetName = 'Reporte';
  let rows: Record<string, unknown>[] = [];

  if (tab === 'financiero') {
    sheetName = 'Financiero';
    rows = (await getFinancialReport(companyId)).map((r) => ({
      Condominio: r.condoName,
      Moneda: r.currency,
      Facturado: r.billed,
      Recaudado: r.collected,
      '% Recaudo': r.pct,
    }));
  } else if (tab === 'morosidad') {
    sheetName = 'Morosidad';
    rows = (await getDelinquencyReport(companyId)).map((r) => ({
      Unidad: r.propertyCode,
      Condominio: r.condoName,
      Moneda: r.currency,
      'Saldo vencido': r.balance,
      'Días de atraso': r.daysOverdue,
    }));
  } else if (tab === 'mantenimiento') {
    sheetName = 'Operativo';
    const m = await getMaintenanceReport(companyId);
    rows = [
      { Indicador: 'Total de tickets', Valor: m.total },
      { Indicador: 'Tickets preventivos', Valor: m.preventivos },
      ...Object.entries(m.byStatus).map(([status, count]) => ({
        Indicador: `Tickets en estado "${STATUS_LABEL[status] ?? status}"`,
        Valor: count,
      })),
      { Indicador: 'Costo total registrado', Valor: m.totalCost },
    ];
  } else if (tab === 'proyectos') {
    sheetName = 'Proyectos';
    rows = (await getProjectsReport(companyId)).map((r) => ({
      Proyecto: r.name,
      Condominio: r.condoName,
      Moneda: r.currency,
      Estado: STATUS_LABEL[r.status] ?? r.status,
      Presupuesto: r.budget,
      Gastado: r.spent,
    }));
  } else if (tab === 'incumplimientos') {
    sheetName = 'Incumplimientos';
    // Este reporte es por condominio, como el módulo: se toma el
    // Condominio Activo, igual que las demás pantallas.
    const condos = await listCondominiumsForSession(session!);
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      rows = (await getViolationReport(companyId, { condominiumId: condoId })).map((r) => ({
        Expediente: r.caseNumber,
        Filial: r.propertyCode,
        Propietario: r.ownerName,
        Incumplimiento: r.typeName,
        Estado: r.status,
        Advertencias: r.warnings,
        Multa: r.fine ? 'Sí' : 'No',
        'Monto de multa': r.fineAmount,
        Apertura: r.openedAt.toISOString().slice(0, 10),
        'Última acción': r.lastActionAt ? r.lastActionAt.toISOString().slice(0, 10) : '',
        Cierre: r.closedAt ? r.closedAt.toISOString().slice(0, 10) : '',
        'Emitido por': r.issuedBy,
        'Notificaciones leídas': `${r.readCount}/${r.actionCount}`,
      }));
    }
  } else {
    return new Response('Reporte desconocido', { status: 400 });
  }

  if (rows.length === 0) rows = [{ Aviso: 'Sin datos para este reporte todavía.' }];

  const ws = XLSX.utils.json_to_sheet(rows);
  // Ancho de columnas acorde al contenido para que el Excel abra legible.
  const firstRow = rows[0]!;
  ws['!cols'] = Object.keys(firstRow).map((key) => ({
    wch: Math.max(key.length, ...rows.map((r) => String(r[key] ?? '').length)) + 2,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const today = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-${tab}-${today}.xlsx"`,
    },
  });
}
