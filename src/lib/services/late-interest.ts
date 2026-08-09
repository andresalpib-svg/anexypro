import { prisma, withTenantContext, forEachCompany } from '@/lib/db';
import { calculateLateInterest, round2, type InterestPolicy } from '@/lib/domain/late-interest';
import { recordChargeAccrual } from '@/lib/services/accounting';

/**
 * Aplicación del interés moratorio sobre los cargos vencidos.
 *
 * Solo corre en condominios que lo activaron explícitamente
 * (`autoInterest`). Nunca genera interés sobre un cargo que ya es de
 * tipo `interes_moratorio` — eso sería interés sobre interés por la
 * puerta de atrás, incluso con política simple.
 */

/** Tipos de cargo que SÍ devengan mora. */
const INTEREST_BEARING = [
  'cuota_ordinaria',
  'cuota_extraordinaria',
  'agua_potable',
  'mantenimiento_parqueo',
  'quick_pass',
] as const;

export type InterestRunSummary = {
  condominiums: number;
  chargesEvaluated: number;
  interestsCreated: number;
  interestsUpdated: number;
  totalAmount: number;
};

/**
 * Calcula y registra el interés de un condominio.
 * `dryRun` calcula sin escribir — sirve para que la administración
 * vea qué se cobraría antes de activar el cobro automático.
 */
export async function applyLateInterestForCondo(
  companyId: string,
  condominiumId: string,
  today: Date,
  opts: { dryRun?: boolean } = {}
) {
  return withTenantContext(companyId, async (tx) => {
    const settings = await tx.condominiumFinancialSettings.findUnique({
      where: { condominiumId },
    });
    if (!settings) return { evaluated: 0, created: 0, updated: 0, amount: 0, detail: [] as any[] };

    const policy: InterestPolicy = {
      monthlyRatePct: Number(settings.lateInterestRate),
      graceDays: settings.interestGraceDays ?? settings.graceDays,
      interestType: settings.interestType,
      maxPct: Number(settings.interestMaxPct),
    };
    if (policy.monthlyRatePct <= 0) {
      return { evaluated: 0, created: 0, updated: 0, amount: 0, detail: [] as any[] };
    }

    // Filiales con convenio de pago vigente: NO devengan interés.
    // Cobrarle intereses a quien está cumpliendo un arreglo firmado es
    // la forma más rápida de que lo abandone.
    const withPlan = await tx.paymentPlan.findMany({
      where: { condominiumId, status: 'vigente' },
      select: { propertyId: true },
    });
    const excluded = withPlan.map((p) => p.propertyId);

    // Cargos vencidos que devengan mora.
    const charges = await tx.charge.findMany({
      where: {
        condominiumId,
        status: { in: ['pendiente', 'parcial'] },
        chargeType: { in: INTEREST_BEARING as unknown as string[] as any },
        dueDate: { lt: today },
        ...(excluded.length > 0 ? { propertyId: { notIn: excluded } } : {}),
      },
      select: {
        id: true,
        propertyId: true,
        description: true,
        amount: true,
        dueDate: true,
        allocations: { where: { payment: { status: 'aplicado' } }, select: { amount: true } },
        // Interés ya cobrado por este cargo.
        interestCharges: {
          where: { status: { not: 'anulado' } },
          select: { id: true, amount: true, interestThroughDate: true },
        },
      },
    });

    let created = 0;
    let updated = 0;
    let amount = 0;
    const detail: { chargeId: string; propertyId: string; toCharge: number; daysLate: number }[] = [];

    for (const charge of charges) {
      const paid = charge.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const outstanding = round2(Number(charge.amount) - paid);
      const alreadyCharged = charge.interestCharges.reduce((s, i) => s + Number(i.amount), 0);

      const result = calculateLateInterest({
        outstanding,
        dueDate: charge.dueDate,
        today,
        alreadyCharged,
        policy,
      });

      // Menos de un colón no se cobra: generaría ruido diario en el
      // estado de cuenta sin ningún valor.
      if (result.toCharge < 1) continue;

      detail.push({
        chargeId: charge.id,
        propertyId: charge.propertyId,
        toCharge: result.toCharge,
        daysLate: result.daysLate,
      });
      amount += result.toCharge;

      if (opts.dryRun) {
        created += 1;
        continue;
      }

      // Un cargo de interés POR CARGO BASE, que se va actualizando.
      // Así el estado de cuenta muestra una línea de interés por
      // cuota, y no una línea nueva cada día.
      const existing = charge.interestCharges[0];
      if (existing) {
        const nuevo = round2(Number(existing.amount) + result.toCharge);
        await tx.charge.update({
          where: { id: existing.id },
          data: {
            amount: nuevo,
            interestThroughDate: today,
            description: `Interés moratorio — ${charge.description} (${result.daysLate} días)`,
          },
        });
        updated += 1;
      } else {
        const property = await tx.property.findUniqueOrThrow({
          where: { id: charge.propertyId },
          select: { code: true },
        });
        const nuevo = await tx.charge.create({
          data: {
            condominiumId,
            propertyId: charge.propertyId,
            chargeType: 'interes_moratorio',
            description: `Interés moratorio — ${charge.description} (${result.daysLate} días)`,
            amount: result.toCharge,
            dueDate: today,
            interestBaseChargeId: charge.id,
            interestThroughDate: today,
          },
        });
        await recordChargeAccrual(tx, companyId, {
          id: nuevo.id,
          condominiumId,
          propertyCode: property.code,
          chargeType: 'interes_moratorio',
          description: nuevo.description,
          amount: result.toCharge,
          period: null,
          issuedAt: today,
        });
        created += 1;
      }
    }

    return { evaluated: charges.length, created, updated, amount: round2(amount), detail };
  });
}

/** Recorre todos los condominios con cobro de interés activado. */
export async function applyLateInterestEverywhere(today: Date): Promise<InterestRunSummary> {
  // Corre desde el programador, sin sesión: empresa por empresa.
  const condos = (
    await forEachCompany((tx) =>
      tx.condominium.findMany({
        where: { deletedAt: null, financialSettings: { autoInterest: true } },
        select: { id: true, companyId: true, name: true },
      })
    )
  ).flatMap((x) => x.result);

  const summary: InterestRunSummary = {
    condominiums: condos.length,
    chargesEvaluated: 0,
    interestsCreated: 0,
    interestsUpdated: 0,
    totalAmount: 0,
  };

  for (const condo of condos) {
    const r = await applyLateInterestForCondo(condo.companyId, condo.id, today);
    summary.chargesEvaluated += r.evaluated;
    summary.interestsCreated += r.created;
    summary.interestsUpdated += r.updated;
    summary.totalAmount = round2(summary.totalAmount + r.amount);
  }

  return summary;
}
