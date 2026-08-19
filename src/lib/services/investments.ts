import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { buildFundBalance } from '@/lib/domain/fund-balance';
import { logActivity } from '@/lib/services/audit';

/**
 * Inversiones financieras del condominio (Etapa 5).
 *
 * SIEMPRE pertenecen a un único condominio (aislamiento) y a un fondo
 * de origen de ESE MISMO condominio. Los intereses que generan se
 * registran como INGRESO FINANCIERO propio (cuenta 4902) — nunca como
 * cuota condominal: no tocan `Charge` ni `Property` en ningún punto.
 */

const INTEREST_INCOME_ACCOUNT = '4902'; // Ingresos Financieros (Intereses)
const DEFAULT_BANK_ACCOUNT = '1001'; // mismo fallback que usa expenses.ts cuando no se indica cuenta

export const INVESTMENT_TYPE_LABEL: Record<string, string> = {
  plazo_fijo: 'Certificado a plazo (CDP)',
  fondo_inversion: 'Fondo de inversión',
  bono: 'Bono',
  certificado: 'Certificado de depósito',
  otro: 'Otro',
};

export const INVESTMENT_STATUS_LABEL: Record<string, string> = {
  activa: 'Activa',
  vencida: 'Vencida',
  liquidada: 'Liquidada',
  cancelada: 'Cancelada',
};

export async function listInvestments(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.investment.findMany({
      where: { condominiumId },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      include: {
        fund: { select: { id: true, name: true, type: true } },
        bankAccount: { select: { id: true, name: true } },
        interestRecords: { select: { amount: true } },
      },
    })
  );
}

export async function getInvestment(companyId: string, investmentId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.investment.findUnique({
      where: { id: investmentId },
      include: {
        fund: { select: { id: true, name: true, type: true } },
        bankAccount: { select: { id: true, name: true } },
        interestRecords: { orderBy: { date: 'desc' } },
      },
    })
  );
}

/**
 * Todos los intereses de inversión del condominio, aplanados — es el
 * reporte de "Intereses" (Etapa 7). Lee la misma tabla que llena
 * `recordInvestmentInterest`, sin recalcular nada: el total de esta
 * lista es, por construcción, el mismo que ya se contabilizó en la
 * cuenta 4902 (Ingresos Financieros).
 */
export async function listInvestmentInterests(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.investmentInterest.findMany({
      where: { condominiumId },
      orderBy: { date: 'desc' },
      include: {
        investment: { select: { institution: true, investmentType: true } },
        fund: { select: { name: true } },
      },
    })
  );
}

export async function createInvestment(
  companyId: string,
  user: { id: string; name: string },
  input: {
    condominiumId: string;
    fundId: string;
    institution: string;
    investmentType: string;
    amount: number;
    startDate: Date;
    maturityDate?: Date | null;
    rate: number;
    bankAccountId?: string;
    documentUrl?: string;
    documentName?: string;
    notes?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    // El fondo de origen se comprueba contra la BASE, no contra el
    // formulario — un campo oculto no es prueba de nada, y sin esto se
    // podría invertir dinero de un fondo de otro condominio.
    const fund = await tx.fund.findFirst({
      where: { id: input.fundId, condominiumId: input.condominiumId },
      select: { id: true },
    });
    if (!fund) throw new Error('Ese fondo no pertenece a este condominio.');

    if (input.bankAccountId) {
      const bank = await tx.bankAccount.findFirst({
        where: { id: input.bankAccountId, condominiumId: input.condominiumId },
        select: { id: true },
      });
      if (!bank) throw new Error('Esa cuenta bancaria no pertenece a este condominio.');
    }

    // No se puede invertir más de lo que el fondo tiene operativo
    // (libre, sin comprometer ni ya invertido).
    const sums = await tx.fundMovement.groupBy({
      by: ['movType'],
      where: { fundId: input.fundId },
      _sum: { amount: true },
    });
    const balance = buildFundBalance(sums.map((s) => ({ movType: s.movType, amount: Number(s._sum.amount ?? 0) })));
    if (input.amount > balance.operativo + 0.01) {
      throw new Error(
        `El monto a invertir (₡${input.amount.toLocaleString('es-CR')}) supera lo operativo del fondo (₡${balance.operativo.toLocaleString('es-CR')}).`
      );
    }

    const investment = await tx.investment.create({
      data: {
        companyId,
        condominiumId: input.condominiumId,
        fundId: input.fundId,
        institution: input.institution,
        investmentType: input.investmentType as any,
        amount: input.amount,
        startDate: input.startDate,
        maturityDate: input.maturityDate ?? null,
        rate: input.rate,
        bankAccountId: input.bankAccountId || null,
        documentUrl: input.documentUrl || null,
        documentName: input.documentName || null,
        notes: input.notes || null,
        createdById: user.id,
      },
    });

    // Movimiento automático del fondo: el dinero sale a la inversión.
    // Nunca lo crea el usuario a mano (ver USER_MOVEMENT_TYPES en funds.ts).
    await tx.fundMovement.create({
      data: {
        companyId,
        fundId: input.fundId,
        movType: 'inversion',
        amount: input.amount,
        movDate: input.startDate,
        description: `Inversión en ${input.institution}`,
        investmentId: investment.id,
      },
    });

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Inversión registrada',
      target: `${input.institution} · ₡${round2(input.amount).toLocaleString('es-CR')}`,
    });

    return investment;
  });
}

/**
 * Cierra una inversión (vencida/liquidada/cancelada) y devuelve el
 * principal al fondo de origen. `returnAmount` es opcional — por
 * defecto se devuelve el monto original; se puede indicar otro si hubo
 * una liquidación anticipada con penalización.
 */
export async function closeInvestment(
  companyId: string,
  user: { id: string; name: string },
  input: {
    investmentId: string;
    status: 'liquidada' | 'vencida' | 'cancelada';
    closeDate: Date;
    returnAmount?: number;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    const inv = await tx.investment.findUniqueOrThrow({ where: { id: input.investmentId } });
    if (inv.status !== 'activa') throw new Error('Esta inversión ya no está activa.');

    const updated = await tx.investment.update({
      where: { id: input.investmentId },
      data: { status: input.status },
    });

    const returnAmount = round2(input.returnAmount ?? Number(inv.amount));
    if (returnAmount > 0) {
      await tx.fundMovement.create({
        data: {
          companyId,
          fundId: inv.fundId,
          movType: 'retorno',
          amount: returnAmount,
          movDate: input.closeDate,
          description: `Retorno de inversión en ${inv.institution} (${input.status})`,
          investmentId: inv.id,
        },
      });
    }

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: `Inversión ${input.status}`,
      target: `${inv.institution} · ₡${returnAmount.toLocaleString('es-CR')}`,
    });

    return updated;
  });
}

/**
 * Registra un interés ganado por la inversión. Es el único punto de
 * toda la Etapa 5 que genera asiento contable: Débito banco / Crédito
 * `4902 Ingresos Financieros` — INGRESO FINANCIERO, nunca cuota
 * condominal (no toca `Charge` ni `Property`). Respeta período cerrado
 * automáticamente vía `createJournalEntryPublic`.
 */
export async function recordInvestmentInterest(
  companyId: string,
  user: { id: string; name: string },
  input: { investmentId: string; amount: number; date: Date }
) {
  if (input.amount <= 0) throw new Error('El monto debe ser mayor que cero.');

  return withTenantContext(companyId, async (tx) => {
    const inv = await tx.investment.findUniqueOrThrow({ where: { id: input.investmentId } });
    if (inv.status !== 'activa') throw new Error('Solo se registran intereses de una inversión activa.');

    const interest = await tx.investmentInterest.create({
      data: {
        companyId,
        condominiumId: inv.condominiumId,
        investmentId: inv.id,
        fundId: inv.fundId,
        amount: input.amount,
        date: input.date,
        createdById: user.id,
      },
    });

    const bankCode = inv.bankAccountId
      ? (await tx.bankAccount.findUnique({ where: { id: inv.bankAccountId }, select: { accountCode: true } }))
          ?.accountCode ?? DEFAULT_BANK_ACCOUNT
      : DEFAULT_BANK_ACCOUNT;
    const { createJournalEntryPublic } = await import('@/lib/services/accounting');
    await createJournalEntryPublic(tx, companyId, {
      condominiumId: inv.condominiumId,
      date: input.date,
      description: `Interés de inversión — ${inv.institution}`,
      source: 'inversion',
      sourceTable: 'investment_interests',
      sourceId: interest.id,
      lines: [
        { accountCode: bankCode, debit: input.amount },
        { accountCode: INTEREST_INCOME_ACCOUNT, credit: input.amount },
      ],
    });

    // El interés se acredita de vuelta al fondo de origen — sigue
    // siendo dinero de ESE fondo, ahora otra vez operativo.
    await tx.fundMovement.create({
      data: {
        companyId,
        fundId: inv.fundId,
        movType: 'aporte',
        amount: input.amount,
        movDate: input.date,
        description: `Interés ganado — ${inv.institution}`,
        investmentId: inv.id,
      },
    });

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Interés de inversión registrado',
      target: `${inv.institution} · ₡${round2(input.amount).toLocaleString('es-CR')}`,
    });

    return interest;
  });
}
