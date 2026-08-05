import { withTenantContext } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { checkJournalBalance } from '@/lib/domain/journal-balance';
import { isPeriodClosed, periodOf } from '@/lib/services/accounting-periods';

/**
 * Mapa de tipo de cargo → cuenta de ingreso. Reconocimiento por
 * devengo: el ingreso se reconoce cuando el cargo se EMITE (no cuando
 * se cobra) — política confirmada contra un estado financiero real
 * (ver diseno-modulo-15-contabilidad.md, "Historial de cambios v1.1"
 * en el prototipo). Idéntico mapa al que usa anexypro-modulo-condominios.html.
 */
const CHARGE_INCOME_ACCOUNT: Record<string, string> = {
  cuota_ordinaria: '4001',
  cuota_extraordinaria: '4101',
  agua_potable: '4201',
  multa: '4202',
  reserva_area_social: '4203',
  mantenimiento_parqueo: '4901',
  quick_pass: '4901',
  reposicion_danos: '4901',
  interes_moratorio: '4901',
  otro: '4901',
};

type JournalLineInput = { accountCode: string; debit?: number; credit?: number };

/**
 * Crea un asiento contable, validando que cuadre ANTES de escribir
 * (mensaje de error legible en la aplicación) — el trigger
 * check_journal_balance de prisma/sql/01_views_functions_triggers.sql
 * es la última línea de defensa, no la única.
 */
/**
 * Igual que `createJournalEntry`, expuesto para los servicios que
 * necesitan generar su propio asiento dentro de su transacción
 * (gastos, pagos de gastos). No se duplica lógica: es la misma
 * función, con las mismas validaciones de balance y de período.
 */
export async function createJournalEntryPublic(
  ...args: Parameters<typeof createJournalEntry>
): ReturnType<typeof createJournalEntry> {
  return createJournalEntry(...args);
}

async function createJournalEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: {
    condominiumId: string;
    date: Date;
    description: string;
    source: 'manual' | 'cuota' | 'pago' | 'gasto_mantenimiento' | 'gasto_proyecto' | 'ia' | 'ajuste';
    sourceTable?: string;
    sourceId?: string;
    lines: JournalLineInput[];
  }
) {
  const check = checkJournalBalance(input.lines);
  if (!check.balanced) {
    throw new Error(check.error);
  }

  // Un mes cerrado no admite asientos nuevos: si se permitiera, los
  // estados financieros ya entregados a la asamblea cambiarían solos.
  if (await isPeriodClosed(tx, input.condominiumId, input.date)) {
    throw new Error(
      `El período ${periodOf(input.date)} está cerrado. Para registrar este movimiento, reabre el mes desde Finanzas → Cierre.`
    );
  }

  const accounts = await tx.chartOfAccount.findMany({
    where: { companyId, code: { in: input.lines.map((l) => l.accountCode) } },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  return tx.journalEntry.create({
    data: {
      condominiumId: input.condominiumId,
      entryDate: input.date,
      description: input.description,
      source: input.source,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
      lines: {
        create: input.lines.map((l) => {
          const acc = byCode.get(l.accountCode);
          if (!acc) throw new Error(`Cuenta contable ${l.accountCode} no existe para esta empresa`);
          return { accountId: acc.id, debit: l.debit ?? 0, credit: l.credit ?? 0 };
        }),
      },
    },
  });
}

/**
 * Reconocimiento de ingreso por devengo: Débito Cuentas por Cobrar
 * (1101) / Crédito Ingreso — se llama SIEMPRE que se emite un cargo,
 * sea por facturación automática o manual. Un cargo anulado nunca
 * genera este asiento.
 */
export async function recordChargeAccrual(
  tx: Prisma.TransactionClient,
  companyId: string,
  charge: { id: string; condominiumId: string; propertyCode: string; chargeType: string; description: string; amount: number; period: Date | null; dueDate: Date }
) {
  const accountCode = CHARGE_INCOME_ACCOUNT[charge.chargeType] ?? '4901';
  return createJournalEntry(tx, companyId, {
    condominiumId: charge.condominiumId,
    date: charge.period ?? charge.dueDate,
    description: `Cargo emitido: ${charge.description} — ${charge.propertyCode}`,
    source: 'cuota',
    sourceTable: 'charges',
    sourceId: charge.id,
    lines: [
      { accountCode: '1101', debit: charge.amount },
      { accountCode, credit: charge.amount },
    ],
  });
}

/**
 * Un pago cancela Cuentas por Cobrar hasta lo realmente aplicado; el
 * excedente (si lo hay) se registra como Adelantos de Condóminos
 * (2002) — pasivo real, nunca ingreso fantasma. El ingreso YA se
 * reconoció en recordChargeAccrual, así que este asiento nunca vuelve
 * a tocar una cuenta de ingreso (evita doble conteo).
 */
export async function recordPaymentEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  payment: { id: string; condominiumId: string; propertyCode: string; amount: number; appliedToCharges: number }
) {
  const advance = Math.max(0, payment.amount - payment.appliedToCharges);
  const lines: JournalLineInput[] = [{ accountCode: '1001', debit: payment.amount }];
  if (payment.appliedToCharges > 0) lines.push({ accountCode: '1101', credit: payment.appliedToCharges });
  if (advance > 0) lines.push({ accountCode: '2002', credit: advance });

  return createJournalEntry(tx, companyId, {
    condominiumId: payment.condominiumId,
    date: new Date(),
    description: `Pago de cuota — ${payment.propertyCode}`,
    source: 'pago',
    sourceTable: 'payments',
    sourceId: payment.id,
    lines,
  });
}

/**
 * Gasto de mantenimiento: Débito Gasto / Crédito Banco — el costo es
 * informativo/de reporte para la administración; NUNCA genera un
 * cargo automático a las unidades (el mantenimiento común se
 * financia con la cuota ordinaria que ya cobra Finanzas). Se
 * contabiliza solo cuando el ticket se completa CON costo.
 */
export async function recordMaintenanceExpense(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: { ticketId: string; condominiumId: string; title: string; amount: number }
) {
  return createJournalEntry(tx, companyId, {
    condominiumId: input.condominiumId,
    date: new Date(),
    description: `Mantenimiento completado: ${input.title}`,
    source: 'gasto_mantenimiento',
    sourceTable: 'maintenance_tickets',
    sourceId: input.ticketId,
    lines: [
      { accountCode: '5003', debit: input.amount },
      { accountCode: '1001', credit: input.amount },
    ],
  });
}

/**
 * Gasto de proyecto: mismo principio — informativo/de control
 * presupuestario, NUNCA genera cargo automático. El financiamiento
 * real (cuando se decide) es una acción deliberada que crea cargos
 * reales en Finanzas (cuota_extraordinaria vía FeeBatch.projectId),
 * no esta función.
 */
export async function recordProjectExpense(
  tx: Prisma.TransactionClient,
  companyId: string,
  input: { expenseId: string; condominiumId: string; description: string; amount: number }
) {
  return createJournalEntry(tx, companyId, {
    condominiumId: input.condominiumId,
    date: new Date(),
    description: `Gasto de proyecto: ${input.description}`,
    source: 'gasto_proyecto',
    sourceTable: 'project_expenses',
    sourceId: input.expenseId,
    lines: [
      { accountCode: '5400', debit: input.amount },
      { accountCode: '1001', credit: input.amount },
    ],
  });
}

// ---------- Reportes — consultan las vistas SQL (ver prisma/sql/01_views_functions_triggers.sql) ----------

export type LedgerRow = {
  code: string;
  name: string;
  type: string;
  entry_date: Date;
  description: string;
  debit: string;
  credit: string;
};

export async function getLibroDiario(companyId: string, condominiumId: string, limit = 100) {
  return withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<LedgerRow[]>`
      SELECT code, name, type, entry_date, description, debit, credit
      FROM v_libro_mayor WHERE condominium_id = ${condominiumId}
      ORDER BY entry_date DESC LIMIT ${limit}
    `
  );
}

export type BalanceRow = { code: string; name: string; type: string; sub: string | null; balance: string };

export async function getBalanceGeneral(companyId: string, condominiumId: string) {
  return withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<BalanceRow[]>`
      SELECT code, name, type, sub, balance FROM v_balance_general
      WHERE condominium_id = ${condominiumId} AND balance <> 0
      ORDER BY code
    `
  );
}

export type ResultadosRow = { code: string; name: string; type: string; is_operating: boolean; balance: string };

export async function getEstadoResultados(companyId: string, condominiumId: string) {
  return withTenantContext(
    companyId,
    (tx) => tx.$queryRaw<ResultadosRow[]>`
      SELECT code, name, type, is_operating, balance FROM v_estado_resultados
      WHERE condominium_id = ${condominiumId} AND balance <> 0
      ORDER BY code
    `
  );
}
