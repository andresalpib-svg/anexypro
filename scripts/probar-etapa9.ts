/**
 * ETAPA 9 — comprobaciones contra la base real.
 *
 *   npx tsx --env-file=.env scripts/probar-etapa9.ts
 *
 * Dos cosas que no se pueden verificar leyendo código:
 *
 *  1. Que la preparación NO haya activado nada.
 *  2. Que las barandas aguanten: consecutivos sin duplicados bajo
 *     concurrencia, sin cruzarse entre condominios, y comprobantes
 *     emitidos que la base se niega a reescribir.
 *
 * Limpia lo que crea. No toca ningún dato financiero existente.
 */
import { PrismaClient } from '@prisma/client';
import { prisma, withTenantContext } from '../src/lib/db';
import { allocateConsecutive, getFiscalSettings, assertPuedeEmitir } from '../src/lib/services/einvoicing';
import { IMPLEMENTADOS } from '../src/lib/einvoicing';

const EMPRESA = '4c2bbca0-3648-41b1-8924-de589805c962';
const CONDO_A = 'e5f326ea-b893-4de1-b68a-71f722525625';
const CONDO_B = 'df207403-5f2d-46ba-947d-f0665917e16e';
const TIPO = 'TEST-ETAPA9';

let fallos = 0;
let pasadas = 0;
function check(nombre: string, esperado: unknown, real: unknown) {
  const ok = JSON.stringify(esperado) === JSON.stringify(real);
  if (ok) { pasadas++; console.log(`  ✅ ${nombre}`); }
  else { fallos++; console.log(`  ❌ ${nombre}\n       esperado: ${JSON.stringify(esperado)}\n       real:     ${JSON.stringify(real)}`); }
}
async function debeFallar(nombre: string, fn: () => Promise<unknown>, patron: RegExp) {
  try {
    await fn();
    fallos++;
    console.log(`  ❌ ${nombre} — NO falló, y debía fallar`);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (patron.test(msg)) { pasadas++; console.log(`  ✅ ${nombre}`); }
    else { fallos++; console.log(`  ❌ ${nombre} — falló con otro motivo:\n       ${msg.slice(0, 200)}`); }
  }
}

/**
 * Limpieza de la prueba.
 *
 * Usa la conexión de DUEÑO (`DIRECT_URL`) porque el rol de la
 * aplicación NO puede desactivar los disparadores — y eso es
 * exactamente lo que se quiere: la aplicación no tiene forma de
 * saltarse la inmutabilidad, ni siquiera para "limpiar". Solo quien
 * administra la base puede, y aquí se hace acotado a los documentos de
 * tipo `TEST-ETAPA9`.
 */
async function limpiar() {
  const dueño = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  try {
    await dueño.$executeRawUnsafe(
      `ALTER TABLE fiscal_documents DISABLE TRIGGER trg_fiscal_document_inmutable, DISABLE TRIGGER trg_fiscal_document_no_borrar`
    );
    await dueño.$executeRawUnsafe(`ALTER TABLE fiscal_document_events DISABLE TRIGGER trg_fiscal_event_solo_agregar`);
    await dueño.fiscalDocumentEvent.deleteMany({ where: { document: { documentType: TIPO } } });
    await dueño.fiscalDocument.deleteMany({ where: { documentType: TIPO } });
    await dueño.fiscalSequence.deleteMany({ where: { documentType: TIPO } });
  } finally {
    await dueño.$executeRawUnsafe(
      `ALTER TABLE fiscal_documents ENABLE TRIGGER trg_fiscal_document_inmutable, ENABLE TRIGGER trg_fiscal_document_no_borrar`
    );
    await dueño.$executeRawUnsafe(`ALTER TABLE fiscal_document_events ENABLE TRIGGER trg_fiscal_event_solo_agregar`);
    await dueño.$disconnect();
  }
}

async function main() {
  console.log('🧱 ETAPA 9 — preparación de facturación electrónica\n');
  await limpiar();

  // ───────── 1. Nada está activo ─────────
  console.log('━━━ Nada está activo ━━━');
  check('no hay proveedores implementados', [], IMPLEMENTADOS);

  const condominios = await withTenantContext(EMPRESA, (tx) =>
    tx.condominium.findMany({ select: { id: true } })
  );
  for (const c of condominios) await getFiscalSettings(EMPRESA, c.id);
  const estados = await withTenantContext(EMPRESA, (tx) =>
    tx.condominiumFiscalSettings.groupBy({ by: ['status'], _count: true })
  );
  check('todos los condominios quedan en "inactivo"', ['inactivo'], estados.map((e) => e.status));

  const catalogos = await prisma.fiscalCatalogEntry.count();
  check('los catálogos de Hacienda están VACÍOS (no se codificaron de memoria)', 0, catalogos);

  const emitidos = await withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.count());
  check('no existe ningún comprobante', 0, emitidos);

  await debeFallar('emitir se niega, con motivo', () => assertPuedeEmitir(EMPRESA, CONDO_A), /no está activa/i);

  // ───────── 2. Consecutivos ─────────
  console.log('\n━━━ Consecutivos ━━━');
  const primero = await withTenantContext(EMPRESA, (tx) =>
    allocateConsecutive(tx, { condominiumId: CONDO_A, documentType: TIPO })
  );
  check('el primer consecutivo es 1', '1', primero.toString());

  const segundo = await withTenantContext(EMPRESA, (tx) =>
    allocateConsecutive(tx, { condominiumId: CONDO_A, documentType: TIPO })
  );
  check('el siguiente es 2', '2', segundo.toString());

  // 30 asignaciones EN PARALELO: es la prueba de que no se usó MAX + 1.
  const enParalelo = await Promise.all(
    Array.from({ length: 30 }, () =>
      withTenantContext(EMPRESA, (tx) => allocateConsecutive(tx, { condominiumId: CONDO_A, documentType: TIPO }))
    )
  );
  const numeros = enParalelo.map((n) => Number(n)).sort((a, b) => a - b);
  check('30 asignaciones simultáneas dan 30 números distintos', 30, new Set(numeros).size);
  check('y son consecutivos, del 3 al 32', [3, 32], [numeros[0], numeros[numeros.length - 1]]);

  // El condominio B arranca de cero: no hereda la numeración de A.
  const primeroB = await withTenantContext(EMPRESA, (tx) =>
    allocateConsecutive(tx, { condominiumId: CONDO_B, documentType: TIPO })
  );
  check('otro condominio arranca en 1 — jamás comparte numeración', '1', primeroB.toString());

  const secuencias = await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalSequence.findMany({ where: { documentType: TIPO }, select: { condominiumId: true, lastNumber: true } })
  );
  check('cada condominio lleva su propio contador', 2, secuencias.length);

  await debeFallar(
    'el consecutivo no puede retroceder',
    () =>
      withTenantContext(EMPRESA, (tx) =>
        tx.fiscalSequence.updateMany({
          where: { condominiumId: CONDO_A, documentType: TIPO },
          data: { lastNumber: 1 },
        })
      ),
    /no puede retroceder/i
  );

  // ───────── 3. Un comprobante emitido no se reescribe ─────────
  console.log('\n━━━ Inmutabilidad del comprobante ━━━');
  const doc = await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocument.create({
      data: {
        companyId: EMPRESA,
        condominiumId: CONDO_A,
        documentType: TIPO,
        status: 'borrador',
        totalAmount: 10_000,
        consecutive: 'PRUEBA-0001',
      },
    })
  );

  await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocument.update({ where: { id: doc.id }, data: { totalAmount: 12_000 } })
  );
  check('en borrador todavía se edita', '12000', String(
    (await withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.findUniqueOrThrow({ where: { id: doc.id } }))).totalAmount
  ));

  await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocument.update({ where: { id: doc.id }, data: { status: 'generado', clave: 'CLAVE-PRUEBA-ETAPA9' } })
  );

  await debeFallar(
    'una vez generado, el monto NO se puede cambiar',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.update({ where: { id: doc.id }, data: { totalAmount: 1 } })),
    /no se edita/i
  );
  await debeFallar(
    'ni la clave',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.update({ where: { id: doc.id }, data: { clave: 'OTRA' } })),
    /no se edita/i
  );
  await debeFallar(
    'ni el consecutivo',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.update({ where: { id: doc.id }, data: { consecutive: 'X' } })),
    /no se edita/i
  );
  await debeFallar(
    'no puede volver a borrador',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.update({ where: { id: doc.id }, data: { status: 'borrador' } })),
    /no puede volver a borrador/i
  );
  await debeFallar(
    'y no se puede borrar: se anula',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.delete({ where: { id: doc.id } })),
    /no se borra/i
  );

  // Avanzar de estado y anotar la respuesta SÍ se permite: es el ciclo
  // de vida, no una reescritura.
  await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocument.update({
      where: { id: doc.id },
      data: { status: 'enviado', sentAt: new Date(), responseCode: '00' },
    })
  );
  check('avanzar de estado sí se permite', 'enviado',
    (await withTenantContext(EMPRESA, (tx) => tx.fiscalDocument.findUniqueOrThrow({ where: { id: doc.id } }))).status
  );

  // ───────── 4. Historial de solo agregar ─────────
  console.log('\n━━━ Historial ━━━');
  const evento = await withTenantContext(EMPRESA, (tx) =>
    tx.fiscalDocumentEvent.create({
      data: { documentId: doc.id, fromStatus: 'generado', toStatus: 'enviado', detail: 'Prueba Etapa 9' },
    })
  );
  await debeFallar(
    'el historial no se modifica',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocumentEvent.update({ where: { id: evento.id }, data: { detail: 'otro' } })),
    /no se modifica/i
  );
  await debeFallar(
    'el historial no se borra',
    () => withTenantContext(EMPRESA, (tx) => tx.fiscalDocumentEvent.delete({ where: { id: evento.id } })),
    /no se modifica/i
  );

  // ───────── 5. Aislamiento entre empresas ─────────
  console.log('\n━━━ Aislamiento ━━━');
  const otraEmpresa = '636f24bc-1db0-429c-983b-a6e30fb53d41';
  const desdeOtra = await withTenantContext(otraEmpresa, (tx) => tx.fiscalDocument.count());
  check('otra empresa no ve los comprobantes de esta (RLS)', 0, desdeOtra);

  await limpiar();
  console.log(`\n${fallos === 0 ? '✅' : '❌'} ${pasadas} comprobaciones pasaron, ${fallos} fallaron.`);
  await prisma.$disconnect();
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
