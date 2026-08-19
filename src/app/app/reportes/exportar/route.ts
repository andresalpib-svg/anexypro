import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import {
  getFinancialReport,
  getDelinquencyReport,
  getMaintenanceReport,
  getProjectsReport,
  getEgresosReport,
  getResumenFinanciero,
} from '@/lib/services/reports';
import { getViolationReport } from '@/lib/services/violation-followup';
import { getEstadoResultadosRango, getBalanceGeneral } from '@/lib/services/accounting';
import { getBudget } from '@/lib/services/budget';
import { listFunds } from '@/lib/services/funds';
import { listInvestments, listInvestmentInterests, INVESTMENT_TYPE_LABEL, INVESTMENT_STATUS_LABEL } from '@/lib/services/investments';
import { listAssets } from '@/lib/services/maintenance';
import { listAssetBookValues, listDepreciationEntries } from '@/lib/services/asset-depreciation';
import { round2 } from '@/lib/domain/late-interest';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { resolveCondoId } from '@/lib/active-condo';

const FUND_TYPE_LABEL: Record<string, string> = {
  operativo: 'Fondo operativo',
  reserva: 'Fondo de reserva',
  especial: 'Fondo especial',
  proyecto: 'Fondo para proyecto',
  otro: 'Otro fondo',
};

const ASSET_STATUS_LABEL: Record<string, string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  baja: 'De baja',
};

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

  // Mismo recorte que la pantalla (auditoría de seguridad 2026-08-11,
  // hallazgo #16): un admin_staff solo descarga sus condominios
  // asignados, no toda la empresa.
  const condos = await listCondominiumsForSession(session!);
  const condoIds = condos.map((c) => c.id);

  let sheetName = 'Reporte';
  let rows: Record<string, unknown>[] = [];

  if (tab === 'financiero') {
    sheetName = 'Financiero';
    rows = (await getFinancialReport(companyId, condoIds)).map((r) => ({
      Condominio: r.condoName,
      Moneda: r.currency,
      Facturado: r.billed,
      Recaudado: r.collected,
      '% Recaudo': r.pct,
    }));
  } else if (tab === 'resumen') {
    // Ingresos y egresos del MISMO libro diario (`getResumenFinanciero`),
    // con el desglose de egresos por origen para poder reconciliar
    // contra Finanzas → Gastos. El balance es el histórico acumulado.
    sheetName = 'Resumen';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    const year = Number(req.nextUrl.searchParams.get('anio')) || new Date().getUTCFullYear();
    if (condoId) {
      const [resumen, balance] = await Promise.all([
        getResumenFinanciero(companyId, condoId, year),
        getBalanceGeneral(companyId, condoId),
      ]);
      rows = [
        { Sección: `Resumen ${year}`, Cuenta: 'Total ingresos', Tipo: 'ingreso', Monto: resumen.totalIngresos },
        { Sección: `Resumen ${year}`, Cuenta: 'Total egresos', Tipo: 'gasto', Monto: resumen.totalEgresos },
        { Sección: `Resumen ${year}`, Cuenta: 'Resultado', Tipo: '—', Monto: resumen.resultado },
        ...resumen.egresosPorOrigen.map((o) => ({
          Sección: `Egresos ${year} (por origen)`,
          Cuenta: o.label,
          Tipo: 'gasto',
          Monto: o.total,
        })),
        ...resumen.ingresosRows.map((r) => ({
          Sección: `Ingresos ${year} (detalle)`,
          Cuenta: `${r.code} · ${r.name}`,
          Tipo: r.type,
          Monto: Number(r.balance),
        })),
        ...balance.map((r) => ({ Sección: 'Balance (histórico)', Cuenta: `${r.code} · ${r.name}`, Tipo: r.type, Monto: Number(r.balance) })),
      ];
    }
  } else if (tab === 'morosidad') {
    sheetName = 'Morosidad';
    rows = (await getDelinquencyReport(companyId, condoIds)).map((r) => ({
      Unidad: r.propertyCode,
      Condominio: r.condoName,
      Moneda: r.currency,
      'Saldo vencido': r.balance,
      'Días de atraso': r.daysOverdue,
    }));
  } else if (tab === 'mantenimiento') {
    sheetName = 'Operativo';
    const m = await getMaintenanceReport(companyId, condoIds);
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
    rows = (await getProjectsReport(companyId, condoIds)).map((r) => ({
      Proyecto: r.name,
      Condominio: r.condoName,
      Moneda: r.currency,
      Estado: STATUS_LABEL[r.status] ?? r.status,
      Presupuesto: r.budget,
      Gastado: r.spent,
    }));
  } else if (tab === 'ingresos') {
    // Misma vista v_estado_resultados que la pantalla — un solo condominio.
    sheetName = 'Ingresos';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    const year = Number(req.nextUrl.searchParams.get('anio')) || new Date().getUTCFullYear();
    if (condoId) {
      const resultados = await getEstadoResultadosRango(
        companyId,
        condoId,
        new Date(Date.UTC(year, 0, 1)),
        new Date(Date.UTC(year, 11, 31, 23, 59, 59))
      );
      rows = resultados
        .filter((r) => r.type === 'ingreso')
        .map((r) => ({ Cuenta: `${r.code} · ${r.name}`, Año: year, Monto: Number(r.balance) }));
    }
  } else if (tab === 'egresos') {
    // Mismo `getEgresosReport` que la pantalla: el detalle del módulo
    // de Gastos y, a continuación, el resto del gasto contabilizado
    // (depreciación, mantenimiento, proyectos) hasta el total del año.
    sheetName = 'Egresos';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    const year = Number(req.nextUrl.searchParams.get('anio')) || new Date().getUTCFullYear();
    if (condoId) {
      const reporte = await getEgresosReport(companyId, condoId, year);
      rows = [
        ...reporte.lines.map((e) => ({
          Origen: 'Módulo de Gastos',
          'N.º': e.expenseNumber,
          Fecha: e.issueDate.toISOString().slice(0, 10),
          Proveedor: e.supplier ? (e.supplier.tradeName ?? e.supplier.legalName) : '',
          Descripción: e.description,
          Monto: Number(e.total),
        })),
        ...reporte.ledger.byOrigin
          .filter((o) => o.sourceTable !== 'expenses')
          .map((o) => ({ Origen: o.label, 'N.º': '', Fecha: '', Proveedor: '', Descripción: `Total ${year}`, Monto: o.total })),
        { Origen: 'TOTAL', 'N.º': '', Fecha: '', Proveedor: '', Descripción: `Egresos contabilizados ${year}`, Monto: reporte.ledger.total },
      ];
    }
  } else if (tab === 'fondos') {
    sheetName = 'Fondos';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      rows = (await listFunds(companyId, condoId)).map((f) => ({
        Fondo: f.name,
        Tipo: FUND_TYPE_LABEL[f.type] ?? f.type,
        Operativo: f.balance.operativo,
        Comprometido: f.balance.comprometido,
        Invertido: f.balance.invertido,
        Total: f.balance.total,
      }));
    }
  } else if (tab === 'inversiones') {
    sheetName = 'Inversiones';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      rows = (await listInvestments(companyId, condoId)).map((i) => ({
        Institución: i.institution,
        Tipo: INVESTMENT_TYPE_LABEL[i.investmentType] ?? i.investmentType,
        Fondo: i.fund.name,
        Monto: Number(i.amount),
        'Tasa %': Number(i.rate),
        Estado: INVESTMENT_STATUS_LABEL[i.status] ?? i.status,
      }));
    }
  } else if (tab === 'intereses') {
    sheetName = 'Intereses';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      rows = (await listInvestmentInterests(companyId, condoId)).map((i) => ({
        Fecha: i.date.toISOString().slice(0, 10),
        Inversión: i.investment.institution,
        Fondo: i.fund.name,
        Monto: Number(i.amount),
      }));
    }
  } else if (tab === 'activos') {
    sheetName = 'Activos';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      const [assets, bookValues] = await Promise.all([listAssets(companyId, condoId), listAssetBookValues(companyId, condoId)]);
      rows = assets.map((a) => {
        const accumulated = round2(bookValues.get(a.id) ?? 0);
        const acquisitionValue = a.acquisitionValue !== null ? Number(a.acquisitionValue) : null;
        const bookValue =
          acquisitionValue !== null ? round2(Math.max(Number(a.residualValue ?? 0), acquisitionValue - accumulated)) : null;
        return {
          Código: a.code,
          Nombre: a.name,
          Estado: ASSET_STATUS_LABEL[a.status] ?? a.status,
          Adquisición: acquisitionValue,
          'Valor en libros': bookValue,
        };
      });
    }
  } else if (tab === 'depreciaciones') {
    sheetName = 'Depreciaciones';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    if (condoId) {
      rows = (await listDepreciationEntries(companyId, condoId)).map((e) => ({
        Período: e.period,
        Activo: `${e.asset.code} · ${e.asset.name}`,
        Depreciación: Number(e.amount),
        Acumulada: Number(e.accumulatedAfter),
        'Valor en libros': Number(e.bookValueAfter),
      }));
    }
  } else if (tab === 'presupuesto') {
    sheetName = 'Presupuesto';
    const condoId = resolveCondoId(req.nextUrl.searchParams.get('condoId') ?? undefined, condos);
    const year = Number(req.nextUrl.searchParams.get('anio')) || new Date().getUTCFullYear();
    if (condoId) {
      const budget = await getBudget(companyId, condoId, year);
      rows = budget.rows
        .filter((r) => r.budgeted > 0 || r.executed > 0)
        .map((r) => ({
          Categoría: `${r.code} · ${r.name}`,
          Presupuestado: r.budgeted,
          Ejecutado: r.executed,
          Variación: r.available,
          // Sin presupuesto no hay avance que medir — un 0 % junto a un
          // ejecutado se lee como "no se gastó nada" (igual que en pantalla).
          '% Avance': r.budgeted > 0 ? r.percent : '',
        }));
    }
  } else if (tab === 'incumplimientos') {
    sheetName = 'Incumplimientos';
    // Este reporte es por condominio, como el módulo: se toma el
    // Condominio Activo, igual que las demás pantallas.
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
