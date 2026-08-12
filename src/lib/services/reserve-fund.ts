import { withTenantContext } from '@/lib/db';
import { round2 } from '@/lib/domain/late-interest';
import { logActivity } from '@/lib/services/audit';

/**
 * Fondo de reserva.
 *
 * El saldo se deriva de los movimientos, nunca se guarda. Un USO del
 * fondo exige descripción y, en la práctica, el acuerdo de asamblea
 * que lo respalda: es dinero que los propietarios apartaron para un
 * fin concreto, y gastarlo sin trazabilidad es el reclamo más común
 * en una asamblea.
 */

export type ReserveSummary = {
  contributed: number;
  used: number;
  balance: number;
  targetAmount: number | null;
  progress: number | null;
  monthlyQuota: number;
  /** Meses de gasto operativo que cubre el fondo. */
  monthsCovered: number | null;
};

export async function getReserveFund(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, async (tx) => {
    const fund = await tx.reserveFund.findFirst({
      where: { condominiumId, isActive: true },
      // El listado completo de movimientos SÍ se trae entero a
      // propósito (es el estado de cuenta del fondo, igual que caja
      // chica — un fondo de reserva se audita completo, no "los
      // últimos N"). Lo que NO conviene es sumarlo en JS para el
      // saldo — ver el `groupBy` de abajo — porque eso sí crece sin
      // límite con la antigüedad del condominio sin necesidad.
      include: { movements: { orderBy: [{ movDate: 'desc' }, { createdAt: 'desc' }] } },
    });
    if (!fund) return null;

    // Saldo por `groupBy` en la base, no por `reduce` en Node sobre
    // `fund.movements` completo: el resultado es idéntico (es la
    // misma suma), pero el costo queda en una agregación de Postgres
    // en vez de crecer con cada movimiento que se acumule con los
    // años.
    const sums = await tx.reserveFundMovement.groupBy({
      by: ['movType'],
      where: { fundId: fund.id },
      _sum: { amount: true },
    });
    const contributed = Number(sums.find((s) => s.movType === 'aporte')?._sum.amount ?? 0);
    const used = Number(sums.find((s) => s.movType === 'uso')?._sum.amount ?? 0);
    const balance = round2(contributed - used);

    // Cuántos meses de operación cubre: el mismo criterio del panel.
    const monthStart = new Date();
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 6);
    const expenses = await tx.expense.aggregate({
      where: { condominiumId, status: { in: ['aprobado', 'pagado'] }, issueDate: { gte: monthStart } },
      _sum: { total: true },
    });
    const avgMonthly = Number(expenses._sum.total ?? 0) / 6;

    const target = fund.targetAmount !== null ? Number(fund.targetAmount) : null;

    const summary: ReserveSummary = {
      contributed: round2(contributed),
      used: round2(used),
      balance,
      targetAmount: target,
      progress: target && target > 0 ? Math.min(1, balance / target) : null,
      monthlyQuota: Number(fund.monthlyQuota),
      monthsCovered: avgMonthly > 0 ? round2(balance / avgMonthly) : null,
    };

    return { fund, summary };
  });
}

export async function upsertReserveFund(
  companyId: string,
  input: {
    id?: string;
    condominiumId: string;
    name: string;
    targetAmount?: number | null;
    monthlyQuota: number;
  }
) {
  return withTenantContext(companyId, (tx) => {
    const data = {
      name: input.name,
      targetAmount: input.targetAmount ?? null,
      monthlyQuota: input.monthlyQuota,
    };
    return input.id
      ? tx.reserveFund.update({ where: { id: input.id }, data })
      : tx.reserveFund.create({ data: { companyId, condominiumId: input.condominiumId, ...data } });
  });
}

export async function addReserveMovement(
  companyId: string,
  user: { id: string; name: string },
  input: {
    fundId: string;
    movType: 'aporte' | 'uso';
    amount: number;
    movDate: Date;
    description: string;
    reference?: string;
    documentUrl?: string;
  }
) {
  return withTenantContext(companyId, async (tx) => {
    if (input.movType === 'uso') {
      // Un uso no puede dejar el fondo en negativo. Mismo `groupBy` que
      // `getReserveFund` en vez de traer TODOS los movimientos a Node
      // para sumarlos — el saldo es el mismo, el costo no crece con el
      // historial.
      const sums = await tx.reserveFundMovement.groupBy({
        by: ['movType'],
        where: { fundId: input.fundId },
        _sum: { amount: true },
      });
      const aportes = Number(sums.find((s) => s.movType === 'aporte')?._sum.amount ?? 0);
      const usos = Number(sums.find((s) => s.movType === 'uso')?._sum.amount ?? 0);
      const balance = aportes - usos;
      if (input.amount > balance) {
        throw new Error(
          `El uso (₡${input.amount.toLocaleString('es-CR')}) supera el saldo del fondo (₡${round2(balance).toLocaleString('es-CR')}).`
        );
      }
    }

    const mov = await tx.reserveFundMovement.create({
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
      action: input.movType === 'aporte' ? 'Aporte al fondo de reserva' : 'Uso del fondo de reserva',
      target: `${input.description} · ₡${input.amount.toLocaleString('es-CR')}`,
    });

    return mov;
  });
}

export async function deleteReserveMovement(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) => tx.reserveFundMovement.delete({ where: { id } }));
}
