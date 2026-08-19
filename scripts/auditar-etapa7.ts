/**
 * AUDITORÍA ETAPA 7 — Presupuesto y Reportes financieros.
 *
 *   npx tsx --env-file=.env scripts/auditar-etapa7.ts
 *
 * Siembra movimientos CONTROLADOS en dos condominios de prueba
 * (Etapa7 Test A y Etapa7 Test B), calcula a mano lo que cada reporte
 * debería mostrar, y compara contra lo que devuelven los servicios que
 * usan la pantalla y el Excel. Nada se estima: cada cifra esperada se
 * escribe explícita en este archivo.
 */
import { prisma, withTenantContext } from '../src/lib/db';
import { createExpense, voidExpense, listExpenses, EXECUTED_EXPENSE_STATUSES } from '../src/lib/services/expenses';
import { getBudget, saveBudget } from '../src/lib/services/budget';
import { getFinancialReport, getDelinquencyReport, getProjectsReport, getMaintenanceReport, getEgresosReport, getResumenFinanciero } from '../src/lib/services/reports';
import { getEstadoResultadosRango } from '../src/lib/services/accounting';
import { addManualCharge, makePayment } from '../src/lib/services/finance';
import { listFunds, addFundMovement, upsertFund } from '../src/lib/services/funds';
import { listInvestments, listInvestmentInterests, createInvestment, recordInvestmentInterest } from '../src/lib/services/investments';
import { listAssets, createAsset, completeTicket, createTicket } from '../src/lib/services/maintenance';
import { listProjects, projectSpent } from '../src/lib/services/projects';
import { listAssetBookValues, listDepreciationEntries, runAssetDepreciation } from '../src/lib/services/asset-depreciation';
import { round2 } from '../src/lib/domain/late-interest';

const COMPANY = '4c2bbca0-3648-41b1-8924-de589805c962';
const A = 'e5f326ea-b893-4de1-b68a-71f722525625';
const B = 'df207403-5f2d-46ba-947d-f0665917e16e';
const YEAR = 2026;
const OWNER = { id: 'f000084e-43ea-4e5f-a2d8-2bfa62d1f8f7', name: 'Administrador', role: 'admin_owner' };
const OWNER2 = { id: '95bd5437-2704-46d2-8dc1-a6631ed1369b', name: 'Administrador Principal', role: 'admin_owner' };

let fallos = 0;
let pasadas = 0;
function check(nombre: string, esperado: unknown, real: unknown) {
  const ok = JSON.stringify(esperado) === JSON.stringify(real);
  if (ok) { pasadas++; console.log(`  ✅ ${nombre}`); }
  else { fallos++; console.log(`  ❌ ${nombre}\n       esperado: ${JSON.stringify(esperado)}\n       real:     ${JSON.stringify(real)}`); }
}

async function limpiar(condoId: string) {
  await withTenantContext(COMPANY, async (tx) => {
    await tx.journalLine.deleteMany({ where: { entry: { condominiumId: condoId } } });
    await tx.journalEntry.deleteMany({ where: { condominiumId: condoId } });
    await tx.expensePayment.deleteMany({ where: { expense: { condominiumId: condoId } } });
    await tx.expense.deleteMany({ where: { condominiumId: condoId } });
    await tx.budgetLine.deleteMany({ where: { condominiumId: condoId } });
    await tx.paymentAllocation.deleteMany({ where: { charge: { condominiumId: condoId } } });
    await tx.payment.deleteMany({ where: { condominiumId: condoId } });
    await tx.charge.deleteMany({ where: { condominiumId: condoId } });
    await tx.assetDepreciationEntry.deleteMany({ where: { condominiumId: condoId } });
    await tx.asset.deleteMany({ where: { condominiumId: condoId } });
    await tx.investmentInterest.deleteMany({ where: { condominiumId: condoId } });
    await tx.investment.deleteMany({ where: { condominiumId: condoId } });
    await tx.fundMovement.deleteMany({ where: { fund: { condominiumId: condoId } } });
    await tx.maintenanceTicket.deleteMany({ where: { condominiumId: condoId } });
    await tx.projectExpense.deleteMany({ where: { project: { condominiumId: condoId } } });
    await tx.project.deleteMany({ where: { condominiumId: condoId } });
    await tx.propertyMember.deleteMany({ where: { property: { condominiumId: condoId } } });
    await tx.propertyEvent.deleteMany({ where: { property: { condominiumId: condoId } } });
    await tx.propertyServiceSuspension.deleteMany({ where: { property: { condominiumId: condoId } } });
    await tx.waterReading.deleteMany({ where: { property: { condominiumId: condoId } } });
    await tx.property.deleteMany({ where: { condominiumId: condoId } });
  }, { timeout: 60000 });
}

/** Datos de un condominio. Los montos entran por parámetro para que A y B nunca coincidan. */
async function sembrar(condoId: string, m: {
  prefijo: string;
  cargo1: number; cargo2: number; pago: number;
  gastoSeguridad: number; gastoJardineria: number; gastoBorrador: number; gastoAnulado: number; gastoAnterior: number;
  presupuestoSeguridad: number; presupuestoJardineria: number;
  fondoAporte: number; fondoCompromiso: number;
  inversion: number; interes: number;
  activoValor: number; activoVidaMeses: number;
  ticketCosto: number;
  proyectoPresupuesto: number; proyectoGasto: number;
}) {
  // --- Filiales, cargos y pagos (Financiero / Morosidad / Ingresos) ---
  const props = await withTenantContext(COMPANY, async (tx) => {
    const p1 = await tx.property.create({ data: { condominiumId: condoId, code: `${m.prefijo}-01`, propertyType: 'casa' } });
    const p2 = await tx.property.create({ data: { condominiumId: condoId, code: `${m.prefijo}-02`, propertyType: 'casa' } });
    return [p1, p2];
  });
  await addManualCharge(COMPANY, {
    condominiumId: condoId, propertyId: props[0]!.id, chargeType: 'cuota_ordinaria',
    description: 'Cuota enero', amount: m.cargo1, dueDate: new Date(Date.UTC(YEAR, 0, 15)),
  });
  await addManualCharge(COMPANY, {
    condominiumId: condoId, propertyId: props[1]!.id, chargeType: 'cuota_ordinaria',
    description: 'Cuota marzo', amount: m.cargo2, dueDate: new Date(Date.UTC(YEAR, 2, 10)),
  });
  await makePayment(COMPANY, {
    condominiumId: condoId, propertyId: props[1]!.id, amount: m.pago, method: 'transferencia',
    paymentDate: new Date(Date.UTC(YEAR, 2, 20)),
  }, OWNER.id, OWNER.name);

  // --- Gastos (Egresos / Presupuesto ejecutado / Resumen) ---
  await createExpense(COMPANY, OWNER, {
    condominiumId: condoId, category: 'seguridad', description: 'Vigilancia febrero',
    issueDate: new Date(Date.UTC(YEAR, 1, 5)), subtotal: m.gastoSeguridad, taxAmount: 0,
  });
  await createExpense(COMPANY, OWNER, {
    condominiumId: condoId, category: 'jardineria', description: 'Zacate marzo',
    issueDate: new Date(Date.UTC(YEAR, 2, 8)), subtotal: m.gastoJardineria, taxAmount: 0,
  });
  // admin_staff => queda `por_aprobar`: NO debe contar en ningún reporte.
  await createExpense(COMPANY, { id: '2db297da-f6a5-49f7-ac9b-bcf63bffcb64', name: 'Supervisor', role: 'admin_staff' }, {
    condominiumId: condoId, category: 'administracion', description: 'Papelería sin aprobar',
    issueDate: new Date(Date.UTC(YEAR, 3, 1)), subtotal: m.gastoBorrador, taxAmount: 0,
  });
  const anulado = await createExpense(COMPANY, OWNER, {
    condominiumId: condoId, category: 'servicios', description: 'Recibo duplicado',
    issueDate: new Date(Date.UTC(YEAR, 3, 12)), subtotal: m.gastoAnulado, taxAmount: 0,
  });
  await voidExpense(COMPANY, anulado.id, 'Factura duplicada del proveedor', OWNER2);
  // Gasto del año ANTERIOR: alimenta "Año anterior"/sugerencia, nunca el ejecutado del año.
  await createExpense(COMPANY, OWNER, {
    condominiumId: condoId, category: 'seguridad', description: 'Vigilancia del año pasado',
    issueDate: new Date(Date.UTC(YEAR - 1, 10, 3)), subtotal: m.gastoAnterior, taxAmount: 0,
  });

  // --- Presupuesto ---
  const cuentas = await withTenantContext(COMPANY, (tx) =>
    tx.chartOfAccount.findMany({ where: { condominiumId: condoId, code: { in: ['5303', '5001'] } }, select: { id: true, code: true } })
  );
  const idDe = (code: string) => cuentas.find((c) => c.code === code)!.id;
  await saveBudget(COMPANY, condoId, YEAR, [
    { accountId: idDe('5303'), amount: m.presupuestoSeguridad },
    { accountId: idDe('5001'), amount: m.presupuestoJardineria },
  ]);

  // --- Fondos ---
  const fondo = await withTenantContext(COMPANY, (tx) => tx.fund.findFirstOrThrow({ where: { condominiumId: condoId } }));
  await addFundMovement(COMPANY, OWNER, { fundId: fondo.id, movType: 'aporte', amount: m.fondoAporte, movDate: new Date(Date.UTC(YEAR, 0, 20)), description: 'Aporte inicial' });
  await addFundMovement(COMPANY, OWNER, { fundId: fondo.id, movType: 'compromiso', amount: m.fondoCompromiso, movDate: new Date(Date.UTC(YEAR, 1, 20)), description: 'Compromiso obra' });

  // --- Inversiones e intereses ---
  const inv = await createInvestment(COMPANY, OWNER, {
    condominiumId: condoId, fundId: fondo.id, institution: `Banco ${m.prefijo}`, investmentType: 'certificado',
    amount: m.inversion, startDate: new Date(Date.UTC(YEAR, 1, 1)), rate: 5,
  });
  await recordInvestmentInterest(COMPANY, OWNER, { investmentId: inv.id, amount: m.interes, date: new Date(Date.UTC(YEAR, 5, 30)) });

  // --- Activos y depreciación ---
  const activo = await createAsset(COMPANY, {
    condominiumId: condoId, code: `${m.prefijo}-ACT-001`, name: `Bomba ${m.prefijo}`,
    acquisitionValue: m.activoValor, residualValue: 0, usefulLifeMonths: m.activoVidaMeses,
    depreciationMethod: 'lineal', depreciationStartDate: new Date(Date.UTC(YEAR, 0, 1)),
  });
  await runAssetDepreciation(COMPANY, OWNER, { assetId: activo.id, period: `${YEAR}-01` });
  await runAssetDepreciation(COMPANY, OWNER, { assetId: activo.id, period: `${YEAR}-02` });

  // --- Proyecto con un gasto de Finanzas imputado (la vía actual) ---
  const proyecto = await withTenantContext(COMPANY, (tx) =>
    tx.project.create({ data: { condominiumId: condoId, name: `Obra ${m.prefijo}`, budget: m.proyectoPresupuesto, status: 'en_progreso' } })
  );
  await createExpense(COMPANY, OWNER, {
    condominiumId: condoId, category: 'proyectos', description: `Avance obra ${m.prefijo}`,
    issueDate: new Date(Date.UTC(YEAR, 4, 9)), subtotal: m.proyectoGasto, taxAmount: 0, projectId: proyecto.id,
  });

  // --- Ticket de mantenimiento con costo: genera asiento 5003 SIN pasar por Gastos ---
  const ticket = await createTicket(COMPANY, OWNER.id, {
    condominiumId: condoId, title: `Fuga ${m.prefijo}`, description: 'Reparación de tubería',
    priority: 'media', ticketType: 'correctivo',
  });
  await completeTicket(COMPANY, ticket.id, OWNER.id, OWNER.name, m.ticketCosto);

  return { props, activoId: activo.id, fondoId: fondo.id };
}

const DATOS_A = {
  prefijo: 'A', cargo1: 100_000, cargo2: 50_000, pago: 20_000,
  gastoSeguridad: 200_000, gastoJardineria: 80_000, gastoBorrador: 500_000, gastoAnulado: 33_000, gastoAnterior: 90_000,
  presupuestoSeguridad: 250_000, presupuestoJardineria: 100_000,
  fondoAporte: 2_000_000, fondoCompromiso: 100_000,
  inversion: 1_000_000, interes: 25_000,
  activoValor: 1_200_000, activoVidaMeses: 60, ticketCosto: 44_000,
  proyectoPresupuesto: 3_000_000, proyectoGasto: 150_000,
};
const DATOS_B = {
  prefijo: 'B', cargo1: 700_000, cargo2: 300_000, pago: 250_000,
  gastoSeguridad: 60_000, gastoJardineria: 15_000, gastoBorrador: 900_000, gastoAnulado: 77_000, gastoAnterior: 40_000,
  presupuestoSeguridad: 90_000, presupuestoJardineria: 30_000,
  fondoAporte: 6_000_000, fondoCompromiso: 350_000,
  inversion: 4_000_000, interes: 111_000,
  activoValor: 600_000, activoVidaMeses: 24, ticketCosto: 9_000,
  proyectoPresupuesto: 800_000, proyectoGasto: 22_000,
};

async function auditar(condoId: string, nombre: string, m: typeof DATOS_A) {
  console.log(`\n━━━ ${nombre} ━━━`);
  const ejecutadoEsperado = m.gastoSeguridad + m.gastoJardineria + m.proyectoGasto;

  const depMensualEsperada = round2(m.activoValor / m.activoVidaMeses);
  const otrosEgresos = round2(depMensualEsperada * 2 + m.ticketCosto);
  const egresosTotales = round2(ejecutadoEsperado + otrosEgresos);

  // 1. EGRESOS
  const expenses = await listExpenses(COMPANY, condoId);
  const egresos = expenses.filter((e) => (EXECUTED_EXPENSE_STATUSES as readonly string[]).includes(e.status) && e.issueDate.getUTCFullYear() === YEAR);
  check('Gastos (módulo): solo aprobado/pagado del año', ejecutadoEsperado, round2(egresos.reduce((s, e) => s + Number(e.total), 0)));
  check('Gastos (módulo): cantidad de líneas', 3, egresos.length);

  const rep = await getEgresosReport(COMPANY, condoId, YEAR);
  check('Egresos: el detalle es el del módulo de Gastos', ejecutadoEsperado, rep.totalLines);
  check('Egresos: detalle == lo que el libro diario atribuye al módulo (descuadre 0)', 0, rep.descuadre);
  check('Egresos: total = módulo + depreciación + mantenimiento', egresosTotales, rep.ledger.total);
  check('Egresos: orígenes desglosados', ['expenses', 'maintenance_tickets', 'asset_depreciation_entries'].sort(), rep.ledger.byOrigin.map((o) => o.sourceTable).sort());
  check('Egresos: los orígenes suman el total', rep.ledger.total, round2(rep.ledger.byOrigin.reduce((s, o) => s + o.total, 0)));

  // 2. PRESUPUESTO
  const budget = await getBudget(COMPANY, condoId, YEAR);
  check('Presupuesto: total presupuestado', m.presupuestoSeguridad + m.presupuestoJardineria, budget.totalBudgeted);
  check('Presupuesto: total ejecutado = gasto contabilizado del año', egresosTotales, budget.totalExecuted);
  check('Presupuesto: ejecutado == total de Reportes → Egresos (fuente única)', rep.ledger.total, budget.totalExecuted);
  check('Presupuesto 5003: el ticket de mantenimiento consume su partida', m.ticketCosto, budget.rows.find((r) => r.code === '5003')!.executed);
  check('Presupuesto 5902: la depreciación consume su partida', round2(depMensualEsperada * 2), budget.rows.find((r) => r.code === '5902')!.executed);
  const f5303 = budget.rows.find((r) => r.code === '5303')!;
  const f5001 = budget.rows.find((r) => r.code === '5001')!;
  check('Presupuesto 5400: el gasto de proyecto ejecuta su partida', m.proyectoGasto, budget.rows.find((r) => r.code === '5400')!.executed);
  check('Presupuesto 5303: presupuestado/ejecutado/variación', [m.presupuestoSeguridad, m.gastoSeguridad, round2(m.presupuestoSeguridad - m.gastoSeguridad)], [f5303.budgeted, f5303.executed, f5303.available]);
  check('Presupuesto 5303: año anterior', m.gastoAnterior, f5303.lastYear);
  check('Presupuesto 5001: presupuestado/ejecutado/variación', [m.presupuestoJardineria, m.gastoJardineria, round2(m.presupuestoJardineria - m.gastoJardineria)], [f5001.budgeted, f5001.executed, f5001.available]);
  check('Presupuesto: el gasto anulado NO ejecuta 5301/5302', 0, round2(budget.rows.filter((r) => r.code === '5301' || r.code === '5302').reduce((s, r) => s + r.executed, 0)));
  check('Presupuesto: el gasto por aprobar NO ejecuta 5101', 0, budget.rows.find((r) => r.code === '5101')!.executed);

  // 3. INGRESOS (libro diario)
  const resultados = await getEstadoResultadosRango(COMPANY, condoId, new Date(Date.UTC(YEAR, 0, 1)), new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59)));
  const ingresos = round2(resultados.filter((r) => r.type === 'ingreso').reduce((s, r) => s + Number(r.balance), 0));
  check('Ingresos: cuotas devengadas + interés de inversión', round2(m.cargo1 + m.cargo2 + m.interes), ingresos);

  // 4. FINANCIERO consolidado
  const fin = (await getFinancialReport(COMPANY, [condoId]))[0]!;
  check('Financiero: facturado', m.cargo1 + m.cargo2, fin.billed);
  check('Financiero: recaudado', m.pago, fin.collected);

  // 5. MOROSIDAD
  const mora = await getDelinquencyReport(COMPANY, [condoId]);
  check('Morosidad: saldos por filial', [round2(m.cargo1), round2(m.cargo2 - m.pago)].sort((a, b) => a - b), mora.map((r) => r.balance).sort((a, b) => a - b));
  check('Morosidad: total = facturado - recaudado', round2(m.cargo1 + m.cargo2 - m.pago), round2(mora.reduce((s, r) => s + r.balance, 0)));

  // 6. FONDOS
  const funds = await listFunds(COMPANY, condoId);
  check('Fondos: operativo/comprometido/total', [round2(m.fondoAporte + m.interes - m.inversion - m.fondoCompromiso), m.fondoCompromiso, round2(m.fondoAporte + m.interes)], [funds[0]!.balance.operativo, funds[0]!.balance.comprometido, funds[0]!.balance.total]);

  // 7. INVERSIONES E INTERESES
  const invs = await listInvestments(COMPANY, condoId);
  check('Inversiones: monto', [m.inversion], invs.map((i) => Number(i.amount)));
  const ints = await listInvestmentInterests(COMPANY, condoId);
  check('Intereses: total', m.interes, round2(ints.reduce((s, i) => s + Number(i.amount), 0)));
  const int4902 = round2(resultados.filter((r) => r.code === '4902').reduce((s, r) => s + Number(r.balance), 0));
  check('Intereses: total == cuenta 4902 del libro diario', m.interes, int4902);

  // 8. ACTIVOS Y DEPRECIACIONES
  const [assets, bookValues] = await Promise.all([listAssets(COMPANY, condoId), listAssetBookValues(COMPANY, condoId)]);
  const depMensual = round2(m.activoValor / m.activoVidaMeses);
  check('Activos: valor en libros tras 2 meses', round2(m.activoValor - depMensual * 2), round2(Number(assets[0]!.acquisitionValue) - (bookValues.get(assets[0]!.id) ?? 0)));
  const deps = await listDepreciationEntries(COMPANY, condoId);
  check('Depreciaciones: 2 renglones', 2, deps.length);
  check('Depreciaciones: total', round2(depMensual * 2), round2(deps.reduce((s, d) => s + Number(d.amount), 0)));
  const dep5902 = round2(resultados.filter((r) => r.code === '5902').reduce((s, r) => s + Number(r.balance), 0));
  check('Depreciaciones: total == cuenta 5902 del libro diario', round2(depMensual * 2), dep5902);

  // 9. PROYECTOS y MANTENIMIENTO
  const proyReporte = (await getProjectsReport(COMPANY, [condoId]))[0]!;
  const proyModulo = (await listProjects(COMPANY, condoId))[0]!;
  check('Proyectos: Reportes muestra lo mismo que el módulo de Proyectos', projectSpent(proyModulo), proyReporte.spent);
  check('Proyectos: ejecutado incluye el gasto de Finanzas imputado', m.proyectoGasto, proyReporte.spent);

  const mant = await getMaintenanceReport(COMPANY, [condoId]);
  check('Mantenimiento: costo acumulado', m.ticketCosto, mant.totalCost);

  // 10. RESUMEN: coherencia entre lo que muestra Resumen y el libro diario
  const gastosLibro = round2(resultados.filter((r) => r.type === 'gasto').reduce((s, r) => s + Number(r.balance), 0));
  const resumen = await getResumenFinanciero(COMPANY, condoId, YEAR);
  check('Resumen: egresos == gasto del libro diario', gastosLibro, resumen.totalEgresos);
  check('Resumen: egresos == total de la pestaña Egresos', rep.ledger.total, resumen.totalEgresos);
  check('Resumen: ingresos == pestaña Ingresos', ingresos, resumen.totalIngresos);
  check('Resumen: resultado = ingresos - egresos', round2(ingresos - gastosLibro), resumen.resultado);
  console.log(`  ℹ️  Gasto del libro diario: ${gastosLibro} · Egresos del módulo: ${ejecutadoEsperado} · diferencia: ${round2(gastosLibro - ejecutadoEsperado)} (depreciación ${round2(depMensual * 2)} + mantenimiento ${m.ticketCosto})`);
  check('Resumen: gasto del libro = módulo + depreciación + ticket', egresosTotales, gastosLibro);

  return { egresos: ejecutadoEsperado, ingresos, budget };
}

async function main() {
  console.log('🔍 AUDITORÍA ETAPA 7 — Presupuesto y Reportes\n');
  for (const id of [A, B]) await limpiar(id);
  await sembrar(A, DATOS_A);
  await sembrar(B, DATOS_B);

  const ra = await auditar(A, 'Condominio A', DATOS_A);
  const rb = await auditar(B, 'Condominio B', DATOS_B);

  console.log('\n━━━ Aislamiento multi-condominio ━━━');
  check('A ≠ B en egresos', true, ra.egresos !== rb.egresos);
  check('A ≠ B en ingresos', true, ra.ingresos !== rb.ingresos);
  check('A ≠ B en presupuesto', true, ra.budget.totalBudgeted !== rb.budget.totalBudgeted);
  const consolidado = await getFinancialReport(COMPANY, [A, B]);
  check('Consolidado A+B trae exactamente 2 filas', 2, consolidado.length);
  const soloA = await getFinancialReport(COMPANY, [A]);
  check('Consolidado recortado a A no incluye a B', [DATOS_A.cargo1 + DATOS_A.cargo2], soloA.map((r) => r.billed));

  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
