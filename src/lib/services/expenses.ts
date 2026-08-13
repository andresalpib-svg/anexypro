import type { Prisma } from '@prisma/client';
import { withTenantContext } from '@/lib/db';
import { logActivity } from '@/lib/services/audit';
import { round2 } from '@/lib/domain/late-interest';

/**
 * Gastos: el ciclo del egreso que ANEXYpro no tenía.
 *
 * Hasta ahora solo se contabilizaba gasto que naciera de un ticket de
 * mantenimiento o de un proyecto. La póliza, los salarios, el recibo
 * del agua y los honorarios del contador no tenían dónde registrarse,
 * y el Estado de Resultados quedaba incompleto.
 */

/** Cuenta contable por categoría — el administrador nunca la escribe. */
/**
 * Cuenta contable por categoría. Se mapea al plan de cuentas que ya
 * existe en el sistema (prisma/seed.ts) — no se inventan códigos
 * nuevos: una cuenta inexistente haría fallar el asiento.
 */
export const CATEGORY_ACCOUNT: Record<string, string> = {
  mantenimiento: '5003', // Mantenimiento General
  seguridad: '5303', // Seguridad
  servicios: '5301', // Electricidad (agua y otros servicios comparten grupo)
  administracion: '5101', // Honorarios de Administración
  jardineria: '5001', // Mantenimiento de Áreas Verdes
  limpieza: '5003', // Mantenimiento General
  seguros: '5200', // Seguros
  honorarios: '5101', // Honorarios de Administración
  impuestos: '5500', // Gastos Varios
  proyectos: '5400', // Gastos de Proyectos
  otro: '5500', // Gastos Varios
};

/** Cuenta de pasivo donde se acumula lo que se le debe a proveedores. */
const PAYABLE_ACCOUNT = '2001'; // Proveedores por Pagar

/** Banco por defecto cuando el pago no indica cuenta bancaria. */
const DEFAULT_BANK_ACCOUNT = '1001'; // Banco Cuenta Corriente

export const CATEGORY_LABEL: Record<string, string> = {
  mantenimiento: 'Mantenimiento',
  seguridad: 'Seguridad',
  servicios: 'Servicios (agua, luz, internet)',
  administracion: 'Administración',
  jardineria: 'Jardinería',
  limpieza: 'Limpieza',
  seguros: 'Seguros',
  honorarios: 'Honorarios',
  impuestos: 'Impuestos',
  proyectos: 'Proyectos',
  otro: 'Otro',
};

export const STATUS_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  por_aprobar: 'Por aprobar',
  aprobado: 'Aprobado',
  pagado: 'Pagado',
  anulado: 'Anulado',
};

export type ExpenseInput = {
  condominiumId: string;
  supplierId?: string;
  /** Proyecto al que se imputa, si el gasto es de uno. */
  projectId?: string;
  category: string;
  /**
   * Línea presupuestaria elegida a mano: código de una cuenta de gasto
   * del plan de cuentas. Si viene, manda sobre la cuenta que deduce la
   * categoría — así el gasto ejecuta el rubro del presupuesto que el
   * administrador quiso, no el genérico de la categoría. Opcional: sin
   * ella todo sigue funcionando como siempre.
   */
  budgetAccountCode?: string;
  description: string;
  invoiceNumber?: string;
  issueDate: Date;
  dueDate?: Date | null;
  subtotal: number;
  taxAmount: number;
  documentUrl?: string;
  documentName?: string;
  notes?: string;
};

/**
 * Consecutivo por condominio. Se calcula dentro de la transacción y
 * la unicidad la garantiza el índice `@@unique([condominiumId,
 * expenseNumber])`: si dos usuarios guardan a la vez, uno falla y
 * reintenta en vez de repetir el número.
 */
async function nextExpenseNumber(tx: Prisma.TransactionClient, condominiumId: string): Promise<number> {
  const last = await tx.expense.aggregate({
    where: { condominiumId },
    _max: { expenseNumber: true },
  });
  return (last._max.expenseNumber ?? 0) + 1;
}

/**
 * ¿Este gasto requiere aprobación?
 *  - Un supervisor SIEMPRE requiere aprobación: es control interno
 *    básico que quien gasta no sea quien autoriza.
 *  - El administrador propietario solo si supera el umbral
 *    configurado (0 = sin umbral, se aprueba solo).
 */
export function needsApproval(role: string, total: number, threshold: number): boolean {
  if (role === 'admin_staff') return true;
  if (threshold <= 0) return false;
  return total >= threshold;
}

export async function createExpense(
  companyId: string,
  user: { id: string; name: string; role: string },
  input: ExpenseInput
) {
  return withTenantContext(companyId, async (tx) => {
    const settings = await tx.condominiumFinancialSettings.findUnique({
      where: { condominiumId: input.condominiumId },
      select: { expenseApprovalThreshold: true },
    });
    const threshold = Number(settings?.expenseApprovalThreshold ?? 0);
    const total = round2(input.subtotal + input.taxAmount);
    const requiresApproval = needsApproval(user.role, total, threshold);

    // El proyecto se comprueba contra la BASE, no contra el formulario:
    // un campo oculto no es prueba de nada, y sin esto se podría imputar
    // el gasto de un condominio a un proyecto de otro.
    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, condominiumId: input.condominiumId },
        select: { id: true },
      });
      if (!project) throw new Error('Ese proyecto no pertenece a este condominio.');
    }

    // La línea presupuestaria se comprueba contra el plan de cuentas
    // REAL de la empresa (solo cuentas de gasto): un código inexistente
    // haría fallar el asiento contable después.
    let accountCode = CATEGORY_ACCOUNT[input.category] ?? CATEGORY_ACCOUNT.otro!;
    if (input.budgetAccountCode) {
      const account = await tx.chartOfAccount.findFirst({
        where: { companyId, code: input.budgetAccountCode, type: 'gasto' },
        select: { code: true },
      });
      if (!account) throw new Error('Esa línea presupuestaria no existe en el plan de cuentas.');
      accountCode = account.code;
    }

    const expense = await tx.expense.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        supplierId: input.supplierId || null,
        projectId: input.projectId || null,
        expenseNumber: await nextExpenseNumber(tx, input.condominiumId),
        category: input.category as any,
        accountCode,
        description: input.description,
        invoiceNumber: input.invoiceNumber || null,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        total,
        status: requiresApproval ? 'por_aprobar' : 'aprobado',
        approvedById: requiresApproval ? null : user.id,
        approvedAt: requiresApproval ? null : new Date(),
        documentUrl: input.documentUrl || null,
        documentName: input.documentName || null,
        notes: input.notes || null,
        createdById: user.id,
      },
    });

    // El proveedor APRENDE: la próxima factura suya se clasifica sola.
    if (input.supplierId) {
      await tx.supplier.update({
        where: { id: input.supplierId },
        data: {
          defaultCategory: input.category,
          defaultAccountCode: CATEGORY_ACCOUNT[input.category] ?? null,
        },
      });
    }

    // El asiento solo se genera cuando el gasto queda aprobado: un
    // gasto pendiente de aprobación todavía no es un gasto del
    // condominio.
    if (!requiresApproval) {
      await recordExpenseEntry(tx, companyId, expense);
    }

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: requiresApproval ? 'Gasto registrado (espera aprobación)' : 'Gasto registrado',
      target: `#${expense.expenseNumber} · ${input.description}`,
    });

    return expense;
  });
}

/** Débito Gasto / Crédito Cuentas por Pagar. */
async function recordExpenseEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  expense: { id: string; condominiumId: string; issueDate: Date; description: string; total: any; accountCode: string; expenseNumber: number }
) {
  const { createJournalEntryPublic } = await import('@/lib/services/accounting');
  await createJournalEntryPublic(tx, companyId, {
    condominiumId: expense.condominiumId,
    date: expense.issueDate,
    description: `Gasto #${expense.expenseNumber} — ${expense.description}`,
    source: 'manual',
    sourceTable: 'expenses',
    sourceId: expense.id,
    lines: [
      { accountCode: expense.accountCode, debit: Number(expense.total) },
      { accountCode: PAYABLE_ACCOUNT, credit: Number(expense.total) },
    ],
  });
}

export async function approveExpense(companyId: string, expenseId: string, user: { id: string; name: string }) {
  return withTenantContext(companyId, async (tx) => {
    const expense = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
    if (expense.status !== 'por_aprobar') {
      throw new Error('Este gasto ya no está esperando aprobación.');
    }
    if (expense.createdById === user.id) {
      throw new Error('No podés aprobar un gasto que vos mismo registraste.');
    }

    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: { status: 'aprobado', approvedById: user.id, approvedAt: new Date() },
    });
    await recordExpenseEntry(tx, companyId, updated);
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Gasto aprobado',
      target: `#${updated.expenseNumber} · ${updated.description}`,
    });
    return updated;
  });
}

export async function voidExpense(
  companyId: string,
  expenseId: string,
  reason: string,
  user: { id: string; name: string }
) {
  if (!reason || reason.trim().length < 5) throw new Error('Indicá el motivo de la anulación.');
  return withTenantContext(companyId, async (tx) => {
    const expense = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: { payments: true },
    });
    if (expense.payments.length > 0) {
      throw new Error('Este gasto ya tiene pagos registrados. Eliminá primero los pagos.');
    }
    const updated = await tx.expense.update({
      where: { id: expenseId },
      data: { status: 'anulado', voidedAt: new Date(), voidReason: reason.trim() },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Gasto anulado',
      target: `#${updated.expenseNumber} · ${reason.trim()}`,
    });
    return updated;
  });
}

/** Registra un pago del gasto. Admite pagos parciales. */
export async function payExpense(
  companyId: string,
  user: { id: string; name: string },
  input: {
    expenseId: string;
    bankAccountId?: string;
    amount: number;
    paymentDate: Date;
    method: string;
    reference?: string;
    receiptUrl?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const expense = await tx.expense.findUniqueOrThrow({
      where: { id: input.expenseId },
      include: { payments: { select: { amount: true } } },
    });
    if (expense.status === 'anulado') throw new Error('El gasto está anulado.');
    if (expense.status === 'por_aprobar') throw new Error('El gasto todavía no ha sido aprobado.');

    const paid = expense.payments.reduce((s, p) => s + Number(p.amount), 0);
    const pending = round2(Number(expense.total) - paid);
    if (input.amount > pending + 0.01) {
      throw new Error(`El pago (₡${input.amount.toLocaleString('es-CR')}) supera el saldo pendiente (₡${pending.toLocaleString('es-CR')}).`);
    }

    const payment = await tx.expensePayment.create({
      data: {
        companyId,
        expenseId: input.expenseId,
        bankAccountId: input.bankAccountId || null,
        amount: input.amount,
        paymentDate: input.paymentDate,
        method: input.method as any,
        reference: input.reference || null,
        receiptUrl: input.receiptUrl || null,
        createdById: user.id,
      },
    });

    // Débito Cuentas por Pagar / Crédito Banco.
    const bankCode = input.bankAccountId
      ? (await tx.bankAccount.findUnique({ where: { id: input.bankAccountId }, select: { accountCode: true } }))?.accountCode ?? DEFAULT_BANK_ACCOUNT
      : DEFAULT_BANK_ACCOUNT;
    const { createJournalEntryPublic } = await import('@/lib/services/accounting');
    await createJournalEntryPublic(tx, companyId, {
      condominiumId: expense.condominiumId,
      date: input.paymentDate,
      description: `Pago gasto #${expense.expenseNumber} — ${expense.description}`,
      source: 'manual',
      sourceTable: 'expense_payments',
      sourceId: payment.id,
      lines: [
        { accountCode: PAYABLE_ACCOUNT, debit: input.amount },
        { accountCode: bankCode, credit: input.amount },
      ],
    });

    // Si quedó saldado, el gasto pasa a "pagado".
    if (round2(paid + input.amount) >= Number(expense.total) - 0.01) {
      await tx.expense.update({ where: { id: input.expenseId }, data: { status: 'pagado' } });
    }

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Pago de gasto',
      target: `#${expense.expenseNumber} · ₡${input.amount.toLocaleString('es-CR')}`,
    });
    return payment;
  });
}

/**
 * Sin `take`, a propósito (evaluación de errores 2026-08-11, #16): este
 * mismo listado alimenta el export contable de Gastos
 * (`finanzas/exportar`), que tiene que salir completo — un tope acá
 * dejaría gastos viejos fuera del export sin ningún aviso, un bug
 * peor que la consulta lenta que se buscaba evitar.
 */
export async function listExpenses(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.expense.findMany({
      where: { condominiumId },
      orderBy: [{ issueDate: 'desc' }, { expenseNumber: 'desc' }],
      include: {
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        payments: { select: { amount: true } },
      },
    })
  );
}

export type BudgetLineOption = { code: string; name: string; hasBudget: boolean };

/**
 * Líneas presupuestarias elegibles al registrar un gasto: las cuentas
 * de gasto del plan de cuentas, marcando cuáles tienen monto en el
 * presupuesto del año en curso (las demás también se ofrecen — imputar
 * a un rubro sin presupuesto es válido y el comparativo lo mostrará).
 */
export async function listBudgetLineOptions(
  companyId: string,
  condominiumId: string
): Promise<BudgetLineOption[]> {
  return withTenantContext(companyId, async (tx) => {
    const [accounts, lines] = await Promise.all([
      tx.chartOfAccount.findMany({
        where: { companyId, type: 'gasto' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      tx.budgetLine.findMany({
        where: { condominiumId, period: String(new Date().getUTCFullYear()) },
        select: { accountId: true },
      }),
    ]);
    const withBudget = new Set(lines.map((l) => l.accountId));
    return accounts.map((a) => ({ code: a.code, name: a.name, hasBudget: withBudget.has(a.id) }));
  });
}

export async function listSuppliers(companyId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.supplier.findMany({
      where: { companyId, isActive: true },
      orderBy: { legalName: 'asc' },
    })
  );
}

export async function upsertSupplier(
  companyId: string,
  input: {
    id?: string;
    legalName: string;
    tradeName?: string;
    taxId?: string;
    email?: string;
    phone?: string;
    activity?: string;
  }
) {
  return withTenantContext(companyId, (tx) => {
    const data = {
      legalName: input.legalName,
      tradeName: input.tradeName || null,
      taxId: input.taxId || null,
      email: input.email || null,
      phone: input.phone || null,
      activity: input.activity || null,
    };
    return input.id
      ? tx.supplier.update({ where: { id: input.id }, data })
      : tx.supplier.create({ data: { companyId, ...data } });
  });
}

/** Totales del período para las tarjetas de la pantalla. */
export function summarize(expenses: Awaited<ReturnType<typeof listExpenses>>) {
  const live = expenses.filter((e) => e.status !== 'anulado');
  const total = live.reduce((s, e) => s + Number(e.total), 0);
  const paid = live.reduce((s, e) => s + e.payments.reduce((a, p) => a + Number(p.amount), 0), 0);
  const pendingApproval = expenses.filter((e) => e.status === 'por_aprobar');
  return {
    total: round2(total),
    paid: round2(paid),
    pending: round2(total - paid),
    pendingApprovalCount: pendingApproval.length,
    pendingApprovalAmount: round2(pendingApproval.reduce((s, e) => s + Number(e.total), 0)),
  };
}
