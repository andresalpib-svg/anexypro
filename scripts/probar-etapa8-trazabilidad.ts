/**
 * ETAPA 8 — anulación y trazabilidad, contra la base de verdad.
 *
 *   npx tsx --env-file=.env scripts/probar-etapa8-trazabilidad.ts
 *
 * Comprueba las dos exigencias que no se pueden verificar leyendo
 * código: que un movimiento financiero anulado deje de contar para el
 * saldo PERO siga existiendo, y que cada operación sensible deje
 * registrado quién, cuándo, sobre qué registro, con qué valor anterior
 * y qué valor nuevo.
 */
import { prisma, withTenantContext } from '../src/lib/db';
import { listFunds, addFundMovement, voidFundMovement } from '../src/lib/services/funds';
import { getPettyCash, allocatePettyCash, addPettyCashExpense, voidPettyCashExpense } from '../src/lib/services/petty-cash';
import { getBudget, saveBudget } from '../src/lib/services/budget';
import { round2 } from '../src/lib/domain/late-interest';

const EMPRESA = '4c2bbca0-3648-41b1-8924-de589805c962';
const CONDO_A = 'e5f326ea-b893-4de1-b68a-71f722525625';
const ACTOR = { id: 'f000084e-43ea-4e5f-a2d8-2bfa62d1f8f7', name: 'Administrador' };
const YEAR = 2026;

let fallos = 0;
let pasadas = 0;
function check(nombre: string, esperado: unknown, real: unknown) {
  const ok = JSON.stringify(esperado) === JSON.stringify(real);
  if (ok) { pasadas++; console.log(`  ✅ ${nombre}`); }
  else { fallos++; console.log(`  ❌ ${nombre}\n       esperado: ${JSON.stringify(esperado)}\n       real:     ${JSON.stringify(real)}`); }
}

/** El último rastro de cambio de un registro. */
async function ultimoCambio(entity: string, entityId: string) {
  return withTenantContext(EMPRESA, (tx) =>
    tx.systemAuditEntry.findFirst({
      where: { companyId: EMPRESA, entity, entityId },
      orderBy: { createdAt: 'desc' },
    })
  );
}

async function main() {
  console.log('🧾 ETAPA 8 — anulación y trazabilidad\n');

  // ───────── Movimiento de fondo ─────────
  console.log('━━━ Movimiento de fondo ━━━');
  const fondo = await withTenantContext(EMPRESA, (tx) =>
    tx.fund.findFirstOrThrow({ where: { condominiumId: CONDO_A } })
  );
  const antesFondo = (await listFunds(EMPRESA, CONDO_A))[0]!.balance.total;

  const mov = await addFundMovement(EMPRESA, ACTOR, {
    fundId: fondo.id,
    movType: 'aporte',
    amount: 333_000,
    movDate: new Date(Date.UTC(YEAR, 6, 1)),
    description: 'Aporte de prueba — Etapa 8',
  });
  check('el aporte suma al saldo del fondo', round2(antesFondo + 333_000), (await listFunds(EMPRESA, CONDO_A))[0]!.balance.total);

  await voidFundMovement(EMPRESA, mov.id, 'Depósito duplicado del condómino', ACTOR);
  check('anulado, el saldo vuelve a lo que era', round2(antesFondo), (await listFunds(EMPRESA, CONDO_A))[0]!.balance.total);

  const movEnBase = await withTenantContext(EMPRESA, (tx) => tx.fundMovement.findUnique({ where: { id: mov.id } }));
  check('el movimiento NO se borró de la base', true, movEnBase !== null);
  check('quedó marcado como anulado, con motivo y responsable', ['Depósito duplicado del condómino', ACTOR.id, true], [movEnBase!.voidReason, movEnBase!.voidedById, movEnBase!.voidedAt !== null]);

  const rastroFondo = await ultimoCambio('fund_movements', mov.id);
  check('dejó rastro de auditoría con acción "anular"', 'anular', rastroFondo?.action);
  check('el rastro guarda el monto que tenía', 333000, (rastroFondo?.changes as any)?.snapshot?.monto);
  check('el rastro guarda el motivo', 'Depósito duplicado del condómino', (rastroFondo?.changes as any)?.motivo);
  check('el rastro guarda quién lo hizo', ACTOR.id, rastroFondo?.userId);

  await withTenantContext(EMPRESA, (tx) => tx.fundMovement.delete({ where: { id: mov.id } }));

  // ───────── Caja chica ─────────
  console.log('\n━━━ Caja chica ━━━');
  await allocatePettyCash(EMPRESA, ACTOR.id, ACTOR.name, {
    condominiumId: CONDO_A,
    amount: 100_000,
    allocatedOn: new Date(Date.UTC(YEAR, 6, 1)),
    note: 'Asignación de prueba — Etapa 8',
  });
  const saldoAntes = (await getPettyCash(EMPRESA, CONDO_A)).summary.balance;

  const gasto = await addPettyCashExpense(EMPRESA, ACTOR.id, ACTOR.name, {
    condominiumId: CONDO_A,
    spentOn: new Date(Date.UTC(YEAR, 6, 2)),
    detail: 'Ferretería — prueba Etapa 8',
    amount: 25_000,
  });
  check('el gasto baja el saldo de la caja', round2(saldoAntes - 25_000), (await getPettyCash(EMPRESA, CONDO_A)).summary.balance);

  await voidPettyCashExpense(EMPRESA, gasto.id, 'Factura ilegible, se vuelve a registrar', ACTOR);
  const caja = await getPettyCash(EMPRESA, CONDO_A);
  check('anulado, el saldo vuelve a lo que era', round2(saldoAntes), caja.summary.balance);
  check('el gasto anulado sigue en el informe', true, caja.expenses.some((e) => e.id === gasto.id && e.voidedAt !== null));

  const rastroCaja = await ultimoCambio('petty_cash_expenses', gasto.id);
  check('dejó rastro con el detalle y el monto anulados', ['Ferretería — prueba Etapa 8', 25000], [(rastroCaja?.changes as any)?.snapshot?.detalle, (rastroCaja?.changes as any)?.snapshot?.monto]);

  // ───────── Presupuesto: valor anterior y nuevo ─────────
  console.log('\n━━━ Presupuesto ━━━');
  const cuenta = await withTenantContext(EMPRESA, (tx) =>
    tx.chartOfAccount.findFirstOrThrow({ where: { condominiumId: CONDO_A, code: '5303' }, select: { id: true } })
  );
  const antesPresupuesto = (await getBudget(EMPRESA, CONDO_A, YEAR)).rows.find((r) => r.code === '5303')!.budgeted;

  await saveBudget(EMPRESA, CONDO_A, YEAR, [{ accountId: cuenta.id, amount: 999_000 }], ACTOR);
  const rastroPresupuesto = await ultimoCambio('budget_lines', `${CONDO_A}:${YEAR}`);
  const cambio = (rastroPresupuesto?.changes as any)?.cambios?.[0];
  check('el cambio de partida registra el valor ANTERIOR', antesPresupuesto, cambio?.antes);
  check('el cambio de partida registra el valor NUEVO', 999000, cambio?.despues);
  check('y nombra la partida de forma legible', '5303 · Seguridad', cambio?.campo);

  // se deja como estaba
  await saveBudget(EMPRESA, CONDO_A, YEAR, [{ accountId: cuenta.id, amount: antesPresupuesto }], ACTOR);
  check('restaurado el presupuesto original', antesPresupuesto, (await getBudget(EMPRESA, CONDO_A, YEAR)).rows.find((r) => r.code === '5303')!.budgeted);

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
