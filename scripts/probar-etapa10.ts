/**
 * ETAPA 10 — PRUEBAS INTEGRALES DEL MÓDULO DE FINANZAS
 *
 *   npx tsx --env-file=.env scripts/probar-etapa10.ts
 *
 * Crea TRES condominios nuevos desde cero, registra movimientos
 * distintos en A y en B, no toca C, y comprueba el aislamiento, la
 * matemática financiera y que la facturación electrónica siga apagada.
 *
 * Los condominios se crean con `createCondominium`, el mismo servicio
 * que usa la pantalla: así se prueba también que un condominio nuevo
 * nazca realmente en cero, con su plan de cuentas propio.
 *
 * Es una prueba, no un arreglo: si algo falla, se reporta. No se toca
 * ningún dato de los condominios existentes.
 */
import { PrismaClient } from '@prisma/client';
import { prisma, withTenantContext } from '../src/lib/db';
import { createCondominium } from '../src/lib/services/condominiums';
import { addManualCharge, makePayment } from '../src/lib/services/finance';
import { createExpense } from '../src/lib/services/expenses';
import { getBudget, saveBudget } from '../src/lib/services/budget';
import { listFunds, upsertFund, addFundMovement } from '../src/lib/services/funds';
import { listInvestments, listInvestmentInterests, createInvestment, recordInvestmentInterest } from '../src/lib/services/investments';
import { listAssets, createAsset } from '../src/lib/services/maintenance';
import { listAssetBookValues, listDepreciationEntries, runAssetDepreciation } from '../src/lib/services/asset-depreciation';
import { getEgresosReport, getResumenFinanciero, getFinancialReport, getDelinquencyReport } from '../src/lib/services/reports';
import { getCollectionsView } from '../src/lib/services/collections';
import { getFiscalSettings, allocateConsecutive, assertPuedeEmitir } from '../src/lib/services/einvoicing';
import { IMPLEMENTADOS } from '../src/lib/einvoicing';
import { round2 } from '../src/lib/domain/late-interest';

const EMPRESA = '4c2bbca0-3648-41b1-8924-de589805c962';
const ACTOR = { id: 'f000084e-43ea-4e5f-a2d8-2bfa62d1f8f7', name: 'Administrador', role: 'admin_owner' };
const YEAR = 2026;

let fallos = 0;
let pasadas = 0;
const problemas: string[] = [];

function check(nombre: string, esperado: unknown, real: unknown) {
  const ok = JSON.stringify(esperado) === JSON.stringify(real);
  if (ok) { pasadas++; console.log(`  ✅ ${nombre}`); }
  else {
    fallos++;
    console.log(`  ❌ ${nombre}\n       esperado: ${JSON.stringify(esperado)}\n       real:     ${JSON.stringify(real)}`);
    problemas.push(`${nombre} — esperado ${JSON.stringify(esperado)}, real ${JSON.stringify(real)}`);
  }
}
async function debeFallar(nombre: string, fn: () => Promise<unknown>, patron: RegExp) {
  try {
    await fn();
    fallos++;
    console.log(`  ❌ ${nombre} — NO falló, y debía fallar`);
    problemas.push(`${nombre} — no falló y debía`);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (patron.test(msg)) { pasadas++; console.log(`  ✅ ${nombre}`); }
    else {
      fallos++;
      console.log(`  ❌ ${nombre} — falló con otro motivo: ${msg.slice(0, 160)}`);
      problemas.push(`${nombre} — motivo inesperado: ${msg.slice(0, 160)}`);
    }
  }
}

// ============================================================
// Datos de cada condominio — deliberadamente distintos en TODO
// ============================================================
const DATOS = {
  A: {
    nombre: 'Etapa10 Condominio A',
    codigo: 'E10A',
    cuota1: 120_000, cuota2: 80_000, pago: 45_000,
    gastoSeguridad: 300_000, gastoJardineria: 45_000,
    presupuestoSeguridad: 400_000, presupuestoJardineria: 60_000,
    fondoNombre: 'Reserva A', fondoTipo: 'reserva', fondoCuenta: '1200',
    fondoAporte: 3_000_000, fondoCompromiso: 250_000,
    inversion: 1_500_000, interes: 37_500,
    activoValor: 2_400_000, activoVida: 48, mesesDepreciados: 3,
  },
  B: {
    nombre: 'Etapa10 Condominio B',
    codigo: 'E10B',
    cuota1: 55_000, cuota2: 210_000, pago: 210_000, // B paga una cuota COMPLETA
    gastoSeguridad: 91_000, gastoJardineria: 12_500,
    presupuestoSeguridad: 70_000, presupuestoJardineria: 90_000, // B se pasa del presupuesto
    fondoNombre: 'Fondo especial B', fondoTipo: 'especial', fondoCuenta: '1210',
    fondoAporte: 800_000, fondoCompromiso: 60_000,
    inversion: 400_000, interes: 9_100,
    activoValor: 900_000, activoVida: 36, mesesDepreciados: 1,
  },
} as const;

type Datos = (typeof DATOS)['A'] | (typeof DATOS)['B'];

async function crearCondominio(nombre: string, codigo: string) {
  const condo = await createCondominium(EMPRESA, ACTOR.id, ACTOR.name, {
    name: nombre, code: codigo, type: 'residencial', currency: 'CRC',
    baseFee: 0, dueDay: 15, suspensionMonths: 3, unitsType: 'casa',
  } as any);
  // Los reportes consolidados solo miran condominios ACTIVOS; nacen en
  // "configuración". Se activan para que la prueba sea representativa.
  await withTenantContext(EMPRESA, (tx) =>
    tx.condominium.update({ where: { id: condo.id }, data: { status: 'activo' } })
  );
  return condo.id;
}

/** Radiografía financiera de un condominio, desde los mismos servicios que usan las pantallas. */
async function radiografia(condoId: string) {
  const [egresos, resumen, budget, funds, inversiones, intereses, assets, bookValues, depreciaciones, cobranza] =
    await Promise.all([
      getEgresosReport(EMPRESA, condoId, YEAR),
      getResumenFinanciero(EMPRESA, condoId, YEAR),
      getBudget(EMPRESA, condoId, YEAR),
      listFunds(EMPRESA, condoId),
      listInvestments(EMPRESA, condoId),
      listInvestmentInterests(EMPRESA, condoId),
      listAssets(EMPRESA, condoId),
      listAssetBookValues(EMPRESA, condoId),
      listDepreciationEntries(EMPRESA, condoId),
      getCollectionsView(EMPRESA, condoId),
    ]);
  return {
    egresos: egresos.ledger.total,
    egresosModulo: egresos.totalLines,
    ingresos: resumen.totalIngresos,
    resultado: resumen.resultado,
    presupuestado: budget.totalBudgeted,
    ejecutado: budget.totalExecuted,
    fondos: funds.map((f) => ({ nombre: f.name, ...f.balance })),
    inversiones: inversiones.map((i) => Number(i.amount)),
    intereses: round2(intereses.reduce((s, i) => s + Number(i.amount), 0)),
    activos: assets.map((a) => ({ codigo: a.code, adquisicion: Number(a.acquisitionValue ?? 0) })),
    bookValues,
    depreciaciones: round2(depreciaciones.reduce((s, d) => s + Number(d.amount), 0)),
    // `aging.total` es la cartera pendiente completa de la cobranza:
    // la misma fuente que usan Finanzas → Cobranza y Reportes →
    // Morosidad desde la Etapa 2.
    morosidad: round2(cobranza.aging.total),
    filiales: cobranza.aging.byProperty.length,
  };
}

async function sembrar(condoId: string, m: Datos, prefijo: string) {
  // --- Filiales, cuotas y pagos ---
  const props = await withTenantContext(EMPRESA, async (tx) => {
    const p1 = await tx.property.create({ data: { condominiumId: condoId, code: `${prefijo}-101`, propertyType: 'casa' } });
    const p2 = await tx.property.create({ data: { condominiumId: condoId, code: `${prefijo}-102`, propertyType: 'casa' } });
    return [p1, p2];
  });
  await addManualCharge(EMPRESA, {
    condominiumId: condoId, propertyId: props[0]!.id, chargeType: 'cuota_ordinaria',
    description: 'Cuota de enero', amount: m.cuota1, dueDate: new Date(Date.UTC(YEAR, 0, 15)),
  });
  await addManualCharge(EMPRESA, {
    condominiumId: condoId, propertyId: props[1]!.id, chargeType: 'cuota_ordinaria',
    description: 'Cuota de febrero', amount: m.cuota2, dueDate: new Date(Date.UTC(YEAR, 1, 15)),
  });
  await makePayment(EMPRESA, {
    condominiumId: condoId, propertyId: props[1]!.id, amount: m.pago, method: 'transferencia',
    paymentDate: new Date(Date.UTC(YEAR, 1, 20)),
  }, ACTOR.id, ACTOR.name);

  // --- Gastos ---
  await createExpense(EMPRESA, ACTOR, {
    condominiumId: condoId, category: 'seguridad', description: 'Vigilancia',
    issueDate: new Date(Date.UTC(YEAR, 2, 3)), subtotal: m.gastoSeguridad, taxAmount: 0,
  });
  await createExpense(EMPRESA, ACTOR, {
    condominiumId: condoId, category: 'jardineria', description: 'Zacate',
    issueDate: new Date(Date.UTC(YEAR, 3, 3)), subtotal: m.gastoJardineria, taxAmount: 0,
  });

  // --- Presupuesto ---
  const cuentas = await withTenantContext(EMPRESA, (tx) =>
    tx.chartOfAccount.findMany({ where: { condominiumId: condoId, code: { in: ['5303', '5001'] } }, select: { id: true, code: true } })
  );
  const idDe = (code: string) => cuentas.find((c) => c.code === code)!.id;
  await saveBudget(EMPRESA, condoId, YEAR, [
    { accountId: idDe('5303'), amount: m.presupuestoSeguridad },
    { accountId: idDe('5001'), amount: m.presupuestoJardineria },
  ], ACTOR);

  // --- Fondo ---
  const fondo = await upsertFund(EMPRESA, {
    condominiumId: condoId, type: m.fondoTipo, name: m.fondoNombre,
    monthlyQuota: 0, accountCode: m.fondoCuenta,
  });
  await addFundMovement(EMPRESA, ACTOR, {
    fundId: fondo.id, movType: 'aporte', amount: m.fondoAporte,
    movDate: new Date(Date.UTC(YEAR, 0, 10)), description: 'Aporte inicial',
  });
  await addFundMovement(EMPRESA, ACTOR, {
    fundId: fondo.id, movType: 'compromiso', amount: m.fondoCompromiso,
    movDate: new Date(Date.UTC(YEAR, 1, 10)), description: 'Compromiso de obra',
  });

  // --- Inversión e intereses ---
  const inv = await createInvestment(EMPRESA, ACTOR, {
    condominiumId: condoId, fundId: fondo.id, institution: `Banco ${prefijo}`,
    investmentType: 'plazo_fijo', amount: m.inversion,
    startDate: new Date(Date.UTC(YEAR, 1, 1)), rate: 4.5,
  });
  await recordInvestmentInterest(EMPRESA, ACTOR, {
    investmentId: inv.id, amount: m.interes, date: new Date(Date.UTC(YEAR, 4, 30)),
  });

  // --- Activo y depreciación ---
  const activo = await createAsset(EMPRESA, {
    condominiumId: condoId, code: `${prefijo}-ACT-01`, name: `Planta eléctrica ${prefijo}`,
    acquisitionValue: m.activoValor, residualValue: 0, usefulLifeMonths: m.activoVida,
    depreciationMethod: 'lineal', depreciationStartDate: new Date(Date.UTC(YEAR, 0, 1)),
  });
  for (let i = 1; i <= m.mesesDepreciados; i++) {
    await runAssetDepreciation(EMPRESA, ACTOR, { assetId: activo.id, period: `${YEAR}-${String(i).padStart(2, '0')}` });
  }
  return { props, fondoId: fondo.id, activoId: activo.id };
}

async function borrarCondominios() {
  const dueño = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  try {
    const previos = await dueño.condominium.findMany({
      where: { name: { startsWith: 'Etapa10 ' } }, select: { id: true },
    });
    if (previos.length === 0) return;
    const ids = previos.map((c) => c.id);
    await dueño.$executeRawUnsafe(
      `ALTER TABLE fiscal_documents DISABLE TRIGGER trg_fiscal_document_inmutable, DISABLE TRIGGER trg_fiscal_document_no_borrar`
    );
    await dueño.journalLine.deleteMany({ where: { entry: { condominiumId: { in: ids } } } });
    await dueño.journalEntry.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.paymentAllocation.deleteMany({ where: { charge: { condominiumId: { in: ids } } } });
    await dueño.payment.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.charge.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.expensePayment.deleteMany({ where: { expense: { condominiumId: { in: ids } } } });
    await dueño.expense.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.budgetLine.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.assetDepreciationEntry.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.asset.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.investmentInterest.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.investment.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.fundMovement.deleteMany({ where: { fund: { condominiumId: { in: ids } } } });
    await dueño.fund.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.fiscalDocument.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.fiscalSequence.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.condominiumFiscalSettings.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.propertyEvent.deleteMany({ where: { property: { condominiumId: { in: ids } } } });
    await dueño.property.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.violationType.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.assetCategoryOption.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.chartOfAccount.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.condominiumFinancialSettings.deleteMany({ where: { condominiumId: { in: ids } } });
    await dueño.condominium.deleteMany({ where: { id: { in: ids } } });
    await dueño.$executeRawUnsafe(
      `ALTER TABLE fiscal_documents ENABLE TRIGGER trg_fiscal_document_inmutable, ENABLE TRIGGER trg_fiscal_document_no_borrar`
    );
  } finally {
    await dueño.$disconnect();
  }
}

async function main() {
  console.log('🧪 ETAPA 10 — PRUEBAS INTEGRALES DEL MÓDULO DE FINANZAS\n');
  await borrarCondominios();

  console.log('━━━ Creación: tres condominios nuevos ━━━');
  const A = await crearCondominio(DATOS.A.nombre, DATOS.A.codigo);
  const B = await crearCondominio(DATOS.B.nombre, DATOS.B.codigo);
  const C = await crearCondominio('Etapa10 Condominio C', 'E10C');

  // ─────────────────────────────────────────────
  // Un condominio nuevo comienza desde CERO
  // ─────────────────────────────────────────────
  for (const [etiqueta, id] of [['A', A], ['B', B], ['C', C]] as const) {
    const r = await radiografia(id);
    check(`${etiqueta} nace en cero (ingresos, egresos, presupuesto, morosidad)`,
      [0, 0, 0, 0, 0], [r.ingresos, r.egresos, r.presupuestado, r.ejecutado, r.morosidad]);
    check(`${etiqueta} nace sin fondos, inversiones ni activos`,
      [0, 0, 0], [r.fondos.length, r.inversiones.length, r.activos.length]);
  }
  const cuentasNuevo = await withTenantContext(EMPRESA, (tx) => tx.chartOfAccount.count({ where: { condominiumId: C } }));
  check('un condominio nuevo trae SU PROPIO plan de cuentas (34 cuentas)', 34, cuentasNuevo);

  // ─────────────────────────────────────────────
  // Siembra
  // ─────────────────────────────────────────────
  console.log('\n━━━ Registro de movimientos ━━━');
  await sembrar(A, DATOS.A, 'A');
  await sembrar(B, DATOS.B, 'B');
  console.log('  ℹ️  A y B sembrados con datos distintos. C queda intacto.');

  const rA = await radiografia(A);
  const rB = await radiografia(B);
  const rC = await radiografia(C);

  // ─────────────────────────────────────────────
  // 1-11. Aislamiento
  // ─────────────────────────────────────────────
  console.log('\n━━━ Aislamiento entre condominios ━━━');
  const esperadoEgresosA = DATOS.A.gastoSeguridad + DATOS.A.gastoJardineria + round2(DATOS.A.activoValor / DATOS.A.activoVida) * DATOS.A.mesesDepreciados;
  const esperadoEgresosB = DATOS.B.gastoSeguridad + DATOS.B.gastoJardineria + round2(DATOS.B.activoValor / DATOS.B.activoVida) * DATOS.B.mesesDepreciados;

  check('(1) A tiene SUS cifras, no las de B', [round2(esperadoEgresosA), DATOS.A.presupuestoSeguridad + DATOS.A.presupuestoJardineria], [rA.egresos, rA.presupuestado]);
  check('(2) B tiene SUS cifras, no las de A', [round2(esperadoEgresosB), DATOS.B.presupuestoSeguridad + DATOS.B.presupuestoJardineria], [rB.egresos, rB.presupuestado]);
  check('(3) C permanece en CERO en todo', [0, 0, 0, 0, 0, 0, 0], [rC.ingresos, rC.egresos, rC.presupuestado, rC.ejecutado, rC.morosidad, rC.depreciaciones, rC.intereses]);
  check('(3) C sigue sin fondos, inversiones ni activos', [0, 0, 0], [rC.fondos.length, rC.inversiones.length, rC.activos.length]);

  check('(4) los saldos son independientes', true, rA.ingresos !== rB.ingresos && rA.egresos !== rB.egresos);
  check('(5) la morosidad es independiente', [round2(DATOS.A.cuota1 + DATOS.A.cuota2 - DATOS.A.pago), round2(DATOS.B.cuota1)], [rA.morosidad, rB.morosidad]);
  check('(5) cada uno ve solo SUS filiales', [2, 1, 0], [rA.filiales, rB.filiales, rC.filiales]);
  check('(6) los fondos son independientes', [DATOS.A.fondoNombre, DATOS.B.fondoNombre], [rA.fondos[0]?.nombre, rB.fondos[0]?.nombre]);
  check('(7) las inversiones son independientes', [[DATOS.A.inversion], [DATOS.B.inversion]], [rA.inversiones, rB.inversiones]);
  check('(7) los intereses son independientes', [DATOS.A.interes, DATOS.B.interes], [rA.intereses, rB.intereses]);
  check('(8) los activos son independientes', [['A-ACT-01'], ['B-ACT-01']], [rA.activos.map((a) => a.codigo), rB.activos.map((a) => a.codigo)]);
  check('(9) las depreciaciones son independientes',
    [round2((DATOS.A.activoValor / DATOS.A.activoVida) * DATOS.A.mesesDepreciados), round2((DATOS.B.activoValor / DATOS.B.activoVida) * DATOS.B.mesesDepreciados)],
    [rA.depreciaciones, rB.depreciaciones]);
  check('(10) los presupuestos son independientes', true, rA.presupuestado !== rB.presupuestado);

  // (11) Reportes
  const consolidado = await getFinancialReport(EMPRESA, [A, B, C]);
  const filaA = consolidado.find((r) => r.condoId === A)!;
  const filaB = consolidado.find((r) => r.condoId === B)!;
  const filaC = consolidado.find((r) => r.condoId === C)!;
  check('(11) el consolidado separa a cada condominio',
    [DATOS.A.cuota1 + DATOS.A.cuota2, DATOS.B.cuota1 + DATOS.B.cuota2, 0],
    [filaA.billed, filaB.billed, filaC.billed]);
  check('(11) y el recaudado de cada uno', [DATOS.A.pago, DATOS.B.pago, 0], [filaA.collected, filaB.collected, filaC.collected]);
  const soloA = await getFinancialReport(EMPRESA, [A]);
  check('(11) un reporte acotado a A no trae a B ni a C', 1, soloA.length);
  const moraConsolidada = await getDelinquencyReport(EMPRESA, [A, B, C]);
  // Se compara el nombre COMPLETO, no `includes('C')`: la palabra
  // "Condominio" lleva una C y ese filtro daba por morosos a los tres.
  // (Fue un error de esta prueba en su primera corrida, no del reporte.)
  check('(11) C no aparece en el reporte de morosidad', 0,
    moraConsolidada.filter((r) => r.condoName === 'Etapa10 Condominio C').length);
  check('(11) el reporte de morosidad solo trae filiales de A y de B',
    ['A-101', 'A-102', 'B-101'], moraConsolidada.map((r) => r.propertyCode).sort());

  // ─────────────────────────────────────────────
  // Pruebas matemáticas
  // ─────────────────────────────────────────────
  console.log('\n━━━ Matemática financiera ━━━');
  for (const [etiqueta, r] of [['A', rA], ['B', rB], ['C', rC]] as const) {
    check(`${etiqueta}: Ingresos − Egresos = Resultado`, round2(r.ingresos - r.egresos), r.resultado);
  }

  for (const [etiqueta, id, m] of [['A', A, DATOS.A], ['B', B, DATOS.B]] as const) {
    const assets = await listAssets(EMPRESA, id);
    const book = await listAssetBookValues(EMPRESA, id);
    const activo = assets[0]!;
    const acumulada = round2(book.get(activo.id) ?? 0);
    const enLibros = round2(Number(activo.acquisitionValue) - acumulada);
    check(`${etiqueta}: Adquisición − Depreciación acumulada = Valor en libros`,
      round2(m.activoValor - (m.activoValor / m.activoVida) * m.mesesDepreciados), enLibros);
  }

  for (const [etiqueta, id] of [['A', A], ['B', B]] as const) {
    const b = await getBudget(EMPRESA, id, YEAR);
    const desviadas = b.rows.filter((r) => round2(r.budgeted - r.executed) !== r.available);
    check(`${etiqueta}: Presupuesto − Ejecutado = Variación (en todas las partidas)`, 0, desviadas.length);
  }

  for (const [etiqueta, id] of [['A', A], ['B', B]] as const) {
    const funds = await listFunds(EMPRESA, id);
    const f = funds[0]!.balance;
    check(`${etiqueta}: operativo + comprometido + invertido = total del fondo`,
      f.total, round2(f.operativo + f.comprometido + f.invertido));
  }

  // El presupuesto ejecutado y el total de egresos son el MISMO número.
  for (const [etiqueta, r] of [['A', rA], ['B', rB], ['C', rC]] as const) {
    check(`${etiqueta}: Presupuesto ejecutado = total de Reportes → Egresos (fuente única)`, r.egresos, r.ejecutado);
  }

  // ─────────────────────────────────────────────
  // 12. Permisos
  // ─────────────────────────────────────────────
  console.log('\n━━━ Permisos y acceso ━━━');
  const supervisor = await prisma.user.findFirstOrThrow({ where: { email: 'supervisor-a@etapa8.test' } });
  await withTenantContext(EMPRESA, async (tx) => {
    await tx.condominiumSupervisor.deleteMany({ where: { userId: supervisor.id } });
    await tx.condominiumSupervisor.create({ data: { condominiumId: A, userId: supervisor.id } });
  });
  const sesionSupervisor = { user: { id: supervisor.id, companyId: EMPRESA, role: 'admin_staff' } };
  const { listCondominiumsForSession, canAccessCondo } = await import('../src/lib/services/condominiums');
  const visibles = await listCondominiumsForSession(sesionSupervisor);
  check('(12) el supervisor de A solo ve el condominio A', [true, false, false],
    [visibles.some((c) => c.id === A), visibles.some((c) => c.id === B), visibles.some((c) => c.id === C)]);
  check('(12) y el backend le niega B y C', [true, false, false], [
    await canAccessCondo(sesionSupervisor, A),
    await canAccessCondo(sesionSupervisor, B),
    await canAccessCondo(sesionSupervisor, C),
  ]);
  const consolidadoSupervisor = await getFinancialReport(EMPRESA, visibles.map((c) => c.id));
  check('(12) su reporte consolidado no incluye B ni C', [false, false],
    [consolidadoSupervisor.some((r) => r.condoId === B), consolidadoSupervisor.some((r) => r.condoId === C)]);

  // ─────────────────────────────────────────────
  // Trazabilidad
  // ─────────────────────────────────────────────
  console.log('\n━━━ Trazabilidad ━━━');
  const rastro = await withTenantContext(EMPRESA, (tx) =>
    tx.systemAuditEntry.findMany({ where: { condominiumId: { in: [A, B] }, entity: 'budget_lines' } })
  );
  check('el cambio de presupuesto dejó rastro en los DOS condominios', 2, rastro.length);
  const cambioA = rastro.find((r) => r.condominiumId === A);
  check('con valor anterior y valor nuevo', [0, DATOS.A.presupuestoSeguridad],
    [(cambioA?.changes as any)?.cambios?.[0]?.antes, (cambioA?.changes as any)?.cambios?.[0]?.despues]);
  const bitacora = await withTenantContext(EMPRESA, (tx) =>
    tx.auditLog.count({ where: { module: 'Condominios', action: 'Condominio creado' } })
  );
  check('la creación de los condominios quedó en la bitácora', true, bitacora >= 3);

  // ─────────────────────────────────────────────
  // Facturación electrónica: sigue apagada
  // ─────────────────────────────────────────────
  console.log('\n━━━ Facturación electrónica (debe seguir INACTIVA) ━━━');
  check('no hay proveedores implementados', [], IMPLEMENTADOS);
  for (const [etiqueta, id] of [['A', A], ['B', B], ['C', C]] as const) {
    const fs = await getFiscalSettings(EMPRESA, id);
    check(`${etiqueta}: nace inactivo, en ambiente de pruebas, sin proveedor`,
      ['inactivo', 'pruebas', 'ninguno'], [fs.status, fs.environment, fs.providerKind]);
    check(`${etiqueta}: sin identificación ni actividad económica heredadas`,
      [null, null, null], [fs.identificationNumber, fs.economicActivityCode, fs.taxConditionCode]);
    await debeFallar(`${etiqueta}: emitir se niega`, () => assertPuedeEmitir(EMPRESA, id), /no está activa/i);
  }
  const comprobantes = await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocument.count({ where: { condominiumId: { in: [A, B, C] } } })
  );
  check('no se emitió ningún comprobante', 0, comprobantes);
  const credenciales = await withTenantContext(EMPRESA, (tx) =>
    tx.eInvoicingCredential.count({ where: { condominiumId: { in: [A, B, C] } } })
  );
  check('no hay ninguna credencial guardada', 0, credenciales);

  // Consecutivos: cada condominio el suyo, desde 1.
  const consecA1 = await withTenantContext(EMPRESA, (tx) => allocateConsecutive(tx, { condominiumId: A, documentType: 'E10' }));
  const consecA2 = await withTenantContext(EMPRESA, (tx) => allocateConsecutive(tx, { condominiumId: A, documentType: 'E10' }));
  const consecB1 = await withTenantContext(EMPRESA, (tx) => allocateConsecutive(tx, { condominiumId: B, documentType: 'E10' }));
  check('los consecutivos NO se comparten: A va 1,2 y B arranca en 1',
    ['1', '2', '1'], [consecA1.toString(), consecA2.toString(), consecB1.toString()]);
  const secuenciasC = await withTenantContext(EMPRESA, (tx) => tx.fiscalSequence.count({ where: { condominiumId: C } }));
  check('C, que no pidió ninguno, no tiene consecutivo', 0, secuenciasC);

  // ─────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${fallos === 0 ? '✅' : '❌'} ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
  if (problemas.length) {
    console.log('\nPROBLEMAS:');
    problemas.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
  console.log('\nLos condominios de prueba quedan en la base para inspección manual.');
  console.log('Para borrarlos: npx tsx --env-file=.env scripts/probar-etapa10.ts --limpiar');

  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

if (process.argv.includes('--limpiar')) {
  borrarCondominios()
    .then(() => console.log('Condominios de la Etapa 10 eliminados.'))
    .finally(() => prisma.$disconnect());
} else {
  main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
