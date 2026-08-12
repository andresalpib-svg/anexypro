import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance } from '@/lib/services/finance';

/**
 * Reporte de filiales al día / en morosidad en Excel real (.xlsx).
 * Mismos datos y mismo servicio que los recuadros de Cuotas y pagos —
 * sin duplicar lógica, solo cambia el formato de salida.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!can(session, 'finanzas')) return new Response('Sin acceso a Finanzas', { status: 403 });

  const condoId = req.nextUrl.searchParams.get('condoId') ?? '';
  const estado = req.nextUrl.searchParams.get('estado') ?? 'aldia';
  if (!['aldia', 'morosidad'].includes(estado)) return new Response('Reporte desconocido', { status: 400 });

  // El condominio se valida contra los que la sesión puede ver — un
  // supervisor solo descarga los suyos.
  const condos = await listCondominiumsForSession(session!);
  const condo = condos.find((c) => c.id === condoId);
  if (!condo) return new Response('Sin acceso a ese condominio', { status: 403 });

  const properties = await listPropertiesWithBalance(session!.user.companyId, condoId);

  let sheetName: string;
  let rows: Record<string, unknown>[];
  if (estado === 'aldia') {
    sheetName = 'Al día';
    rows = properties
      .filter((p) => p.balance <= 0)
      .map((p) => ({ 'N.º de casa': p.code, Propietario: p.ownerName ?? '' }));
  } else {
    sheetName = 'Morosidad';
    rows = properties
      .filter((p) => p.balance > 0)
      .map((p) => ({
        'N.º de casa': p.code,
        Propietario: p.ownerName ?? '',
        Moneda: condo.currency,
        'Saldo pendiente': p.balance,
        'Cuotas ordinarias vencidas': p.monthsOverdue,
        'Convenio vigente': p.hasPaymentPlan ? 'Sí' : 'No',
        'Servicios suspendidos': p.suspended ? (p.manualSuspension ? 'Sí (manual)' : 'Sí') : 'No',
      }));
  }

  if (rows.length === 0) rows = [{ Aviso: 'Sin filiales en este estado.' }];

  const ws = XLSX.utils.json_to_sheet(rows);
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
      'Content-Disposition': `attachment; filename="filiales-${estado}-${today}.xlsx"`,
    },
  });
}
