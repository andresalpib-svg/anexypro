import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { buildFundBalance, type FundMovementInput } from '@/lib/domain/fund-balance';
import { logActivity } from '@/lib/services/audit';
import { logChange } from '@/lib/services/audit-trail';

/**
 * Fondos del condominio (Etapa 5): operativo, reserva, especiales,
 * proyectos y otros configurables. Generaliza al `ReserveFund` de la
 * Fase 4 (un solo fondo, tipo fijo "reserva") — la migración de esos
 * datos vive en `scripts/migrar-reservefund-a-fund.ts`.
 *
 * El saldo NUNCA se guarda: se deriva de los movimientos con
 * `buildFundBalance`, igual que ya hacían `ReserveFund` y `BankAccount`.
 */

export const FUND_TYPE_LABEL: Record<string, string> = {
  operativo: 'Fondo operativo',
  reserva: 'Fondo de reserva',
  especial: 'Fondo especial',
  proyecto: 'Fondo para proyecto',
  otro: 'Otro fondo',
};

/** Solo estos 4 los puede crear un usuario a mano — inversión/retorno los crea únicamente `services/investments.ts`. */
export const USER_MOVEMENT_TYPES = ['aporte', 'uso', 'compromiso', 'liberacion'] as const;
export type UserMovementType = (typeof USER_MOVEMENT_TYPES)[number];

export type FundWithBalance = Awaited<ReturnType<typeof listFunds>>[number];

/**
 * Todos los fondos activos del condominio, con su saldo.
 *
 * Un solo `groupBy` para todos los fondos a la vez (no uno por fondo):
 * el costo no crece con la cantidad de fondos ni con su antigüedad,
 * mismo criterio que ya usaba `getReserveFund`.
 */
export async function listFunds(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const funds = await tx.fund.findMany({
      where: { condominiumId, isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { project: { select: { name: true } } },
    });
    if (funds.length === 0) return [];

    const sums = await tx.fundMovement.groupBy({
      by: ['fundId', 'movType'],
      // Un movimiento anulado sigue en la tabla pero no suma.
      where: { fundId: { in: funds.map((f) => f.id) }, voidedAt: null },
      _sum: { amount: true },
    });
    const byFund = new Map<string, FundMovementInput[]>();
    for (const s of sums) {
      const arr = byFund.get(s.fundId) ?? [];
      arr.push({ movType: s.movType as FundMovementInput['movType'], amount: Number(s._sum.amount ?? 0) });
      byFund.set(s.fundId, arr);
    }

    return funds.map((f) => ({ ...f, balance: buildFundBalance(byFund.get(f.id) ?? []) }));
  });
}

/**
 * Todos los movimientos de todos los fondos del condominio, en una
 * sola consulta — evita N+1 cuando la pantalla muestra varios fondos a
 * la vez (uno por tarjeta).
 */
export async function listFundMovements(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const funds = await tx.fund.findMany({ where: { condominiumId }, select: { id: true } });
    if (funds.length === 0) return [];
    return tx.fundMovement.findMany({
      where: { fundId: { in: funds.map((f) => f.id) } },
      orderBy: [{ movDate: 'desc' }, { createdAt: 'desc' }],
    });
  });
}

/** Un fondo con su historial completo de movimientos — es su estado de cuenta. */
export async function getFund(companyId: string, fundId: string) {
  return withTenantContext(companyId, async (tx) => {
    const fund = await tx.fund.findUnique({
      where: { id: fundId },
      include: {
        project: { select: { name: true } },
        movements: { orderBy: [{ movDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!fund) return null;

    const balance = buildFundBalance(
      fund.movements.map((m) => ({ movType: m.movType, amount: Number(m.amount) }))
    );
    return { fund, balance };
  });
}

export async function upsertFund(
  companyId: string,
  input: {
    id?: string;
    condominiumId: string;
    type: string;
    name: string;
    targetAmount?: number | null;
    monthlyQuota: number;
    accountCode: string;
    projectId?: string | null;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    // La cuenta contable espejo tiene que existir y ser de activo — si
    // no, no hay forma de saber qué representa el fondo en el balance
    // general. Mismo criterio que `createBankAccount`.
    const chart = await tx.chartOfAccount.findUnique({
      where: { condominiumId_code: { condominiumId: input.condominiumId, code: input.accountCode } },
    });
    if (!chart) throw new Error(`La cuenta contable ${input.accountCode} no existe en el plan de cuentas.`);
    if (chart.type !== 'activo') throw new Error(`La cuenta ${input.accountCode} no es una cuenta de activo.`);

    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, condominiumId: input.condominiumId },
        select: { id: true },
      });
      if (!project) throw new Error('Ese proyecto no pertenece a este condominio.');
    }

    const data = {
      type: input.type as any,
      name: input.name,
      targetAmount: input.targetAmount ?? null,
      monthlyQuota: input.monthlyQuota,
      accountCode: input.accountCode,
      projectId: input.projectId || null,
    };
    return input.id
      ? tx.fund.update({ where: { id: input.id }, data })
      : tx.fund.create({ data: { companyId, condominiumId: input.condominiumId, ...data } });
  });
}

/**
 * Movimiento manual de un fondo — solo aporte/uso/compromiso/liberación.
 * Inversión/retorno los crea exclusivamente `services/investments.ts`,
 * nunca directamente el usuario.
 */
export async function addFundMovement(
  companyId: string,
  user: { id: string; name: string },
  input: {
    fundId: string;
    movType: UserMovementType;
    amount: number;
    movDate: Date;
    description: string;
    reference?: string;
    documentUrl?: string;
  }
) {
  if (!USER_MOVEMENT_TYPES.includes(input.movType)) {
    throw new Error('Tipo de movimiento inválido.');
  }
  return withTenantContext(companyId, async (tx) => {
    // Un uso o un compromiso nunca puede dejar lo operativo en
    // negativo; una liberación nunca puede superar lo ya comprometido.
    if (input.movType === 'uso' || input.movType === 'compromiso' || input.movType === 'liberacion') {
      const sums = await tx.fundMovement.groupBy({
        by: ['movType'],
        where: { fundId: input.fundId, voidedAt: null },
        _sum: { amount: true },
      });
      const balance = buildFundBalance(
        sums.map((s) => ({ movType: s.movType, amount: Number(s._sum.amount ?? 0) }))
      );
      if ((input.movType === 'uso' || input.movType === 'compromiso') && input.amount > balance.operativo + 0.01) {
        throw new Error(
          `Ese monto (₡${input.amount.toLocaleString('es-CR')}) supera lo operativo del fondo (₡${balance.operativo.toLocaleString('es-CR')}).`
        );
      }
      if (input.movType === 'liberacion' && input.amount > balance.comprometido + 0.01) {
        throw new Error(
          `Ese monto (₡${input.amount.toLocaleString('es-CR')}) supera lo comprometido del fondo (₡${balance.comprometido.toLocaleString('es-CR')}).`
        );
      }
    }

    const mov = await tx.fundMovement.create({
      data: {
        companyId,
        fundId: input.fundId,
        movType: input.movType,
        amount: input.amount,
        movDate: input.movDate,
        description: input.description,
        reference: input.reference || null,
        documentUrl: input.documentUrl || null,
        createdById: user.id,
      },
    });

    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: `Movimiento de fondo (${input.movType})`,
      target: `${input.description} · ₡${round2(input.amount).toLocaleString('es-CR')}`,
    });

    return mov;
  });
}

/**
 * Anula un movimiento de fondo. NO lo borra.
 *
 * Antes lo eliminaba de verdad (`fundMovement.delete`): el saldo del
 * fondo cambiaba y no quedaba ni rastro de que ese aporte o ese uso
 * hubiera existido, ni de quién lo quitó ni por qué. Para un fondo de
 * reserva —dinero de la asamblea— eso es justamente lo que no puede
 * pasar (Etapa 8, hallazgo 8.3).
 *
 * Un movimiento anulado deja de contar para el saldo (todas las
 * consultas filtran `voidedAt: null`) pero sigue en la lista, marcado,
 * con su motivo y su responsable.
 */
export async function voidFundMovement(
  companyId: string,
  id: string,
  reason: string,
  user: { id: string; name: string }
) {
  if (!reason || reason.trim().length < 5) throw new Error('Indicá el motivo de la anulación.');
  return withTenantContext(companyId, async (tx) => {
    const mov = await tx.fundMovement.findUniqueOrThrow({
      where: { id },
      include: { fund: { select: { name: true, condominiumId: true } } },
    });
    // Un movimiento de inversión/retorno lo generó el sistema junto con
    // la inversión — anularlo a mano desincronizaría el saldo del
    // fondo del de la inversión. Hay que anular/liquidar la inversión.
    if (mov.investmentId) {
      throw new Error('Este movimiento pertenece a una inversión. Anulá o liquidá la inversión en su lugar.');
    }
    if (mov.voidedAt) throw new Error('Este movimiento ya estaba anulado.');

    const anulado = await tx.fundMovement.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: reason.trim(), voidedById: user.id },
    });

    await logChange(tx, companyId, {
      entity: 'fund_movements',
      entityId: id,
      condominiumId: mov.fund.condominiumId,
      action: 'anular',
      userId: user.id,
      motivo: reason.trim(),
      snapshot: {
        fondo: mov.fund.name,
        tipo: mov.movType,
        monto: mov.amount,
        fecha: mov.movDate,
        descripcion: mov.description,
      },
    });
    await logActivity(tx, companyId, {
      userId: user.id,
      userName: user.name,
      module: 'Finanzas',
      action: 'Movimiento de fondo anulado',
      target: `${mov.fund.name} · ${mov.description} · ₡${round2(Number(mov.amount)).toLocaleString('es-CR')} · ${reason.trim()}`,
    });

    return anulado;
  });
}
