/**
 * Migra los datos de `ReserveFund`/`ReserveFundMovement` (Fase 4) a los
 * modelos genéricos `Fund`/`FundMovement` (Etapa 5), con `type =
 * 'reserva'`.
 *
 *   npx tsx scripts/migrar-reservefund-a-fund.ts
 *
 * IDEMPOTENTE a propósito: conserva el mismo `id` en `Fund` que tenía
 * su `ReserveFund` de origen (y lo mismo para cada movimiento), así que
 * correrlo dos veces no duplica nada — se puede correr tantas veces
 * como haga falta, incluida la corrida en producción después de
 * desplegar esta etapa.
 *
 * NO borra `reserve_funds`/`reserve_fund_movements` ni modifica nada en
 * ellas: son datos reales de producción y el corte de la aplicación a
 * los modelos nuevos se hace aparte, en el código. El `DROP` de las
 * tablas viejas es una fase posterior, deliberadamente separada (ver
 * el plan de la Etapa 5).
 */
import { forEachCompany, withTenantContext } from '../src/lib/db';
import { buildFundBalance } from '../src/lib/domain/fund-balance';
import { round2 } from '../src/lib/domain/late-interest';

async function main() {
  const porEmpresa = await forEachCompany((tx) =>
    tx.reserveFund.findMany({ include: { movements: true } })
  );
  const reserveFunds = porEmpresa.flatMap((r) => r.result.map((f) => ({ ...f, companyId: r.companyId })));

  console.log(`ReserveFund encontrados: ${reserveFunds.length}\n`);

  let migrados = 0;
  let yaExistian = 0;
  let movimientosCreados = 0;
  let discrepancias = 0;

  for (const rf of reserveFunds) {
    await withTenantContext(rf.companyId, async (tx) => {
      const yaExiste = await tx.fund.findUnique({ where: { id: rf.id }, select: { id: true } });

      if (!yaExiste) {
        await tx.fund.create({
          data: {
            id: rf.id,
            companyId: rf.companyId,
            condominiumId: rf.condominiumId,
            type: 'reserva',
            name: rf.name,
            targetAmount: rf.targetAmount,
            monthlyQuota: rf.monthlyQuota,
            accountCode: rf.accountCode,
            isActive: rf.isActive,
            createdAt: rf.createdAt,
            updatedAt: rf.updatedAt,
          },
        });
        migrados++;
      } else {
        yaExistian++;
      }

      for (const mov of rf.movements) {
        const movYaExiste = await tx.fundMovement.findUnique({ where: { id: mov.id }, select: { id: true } });
        if (movYaExiste) continue;
        await tx.fundMovement.create({
          data: {
            id: mov.id,
            companyId: mov.companyId,
            fundId: rf.id,
            movType: mov.movType as any, // 'aporte' | 'uso' — mismos valores en ambos enums
            amount: mov.amount,
            movDate: mov.movDate,
            description: mov.description,
            reference: mov.reference,
            documentUrl: mov.documentUrl,
            createdById: mov.createdById,
            createdAt: mov.createdAt,
          },
        });
        movimientosCreados++;
      }

      // Prueba de regresión: el saldo nuevo (buildFundBalance) tiene
      // que coincidir centavo a centavo con el que calculaba
      // getReserveFund (aporte − uso, todo operativo).
      const contributed = rf.movements.filter((m) => m.movType === 'aporte').reduce((s, m) => s + Number(m.amount), 0);
      const used = rf.movements.filter((m) => m.movType === 'uso').reduce((s, m) => s + Number(m.amount), 0);
      const balanceViejo = round2(contributed - used);

      const nuevo = buildFundBalance(rf.movements.map((m) => ({ movType: m.movType as any, amount: Number(m.amount) })));

      if (Math.abs(nuevo.total - balanceViejo) > 0.01 || Math.abs(nuevo.operativo - balanceViejo) > 0.01) {
        discrepancias++;
        console.log(
          `  ✗ Fondo "${rf.name}" (${rf.id}): saldo viejo=${balanceViejo} vs nuevo total=${nuevo.total}/operativo=${nuevo.operativo}`
        );
      }
    });
  }

  console.log('--- Resumen ---');
  console.log(`Fondos migrados ahora: ${migrados}`);
  console.log(`Fondos que ya existían (corrida repetida): ${yaExistian}`);
  console.log(`Movimientos migrados: ${movimientosCreados}`);
  console.log(`Discrepancias de saldo: ${discrepancias}`);
  process.exit(discrepancias > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
