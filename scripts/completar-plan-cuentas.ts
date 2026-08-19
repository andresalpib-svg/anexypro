/**
 * Pone al día el plan de cuentas de TODOS los condominios existentes
 * contra `CHART_OF_ACCOUNTS` (agrega las cuentas nuevas que falten;
 * nunca toca ni borra las que ya existen).
 *
 *   npx tsx scripts/completar-plan-cuentas.ts
 *
 * POR QUÉ HACE FALTA: `ensureChartOfAccounts` es idempotente pero solo
 * se llama al CREAR un condominio (`services/condominios.ts`) — un
 * condominio que ya existía cuando `CHART_OF_ACCOUNTS` ganó una cuenta
 * nueva (ej. 1210/4902 de la Etapa 5 — Fondos e Inversiones) se queda
 * sin ella para siempre si nadie corre este backfill. Este guion
 * recorre cada condominio y llama a `ensureChartOfAccounts` — mismo
 * mecanismo, sin duplicar lógica.
 *
 * Idempotente: correrlo de nuevo con nada pendiente no crea nada.
 * Hace falta correrlo también en producción después de desplegar
 * cualquier cambio que agregue cuentas nuevas al catálogo.
 */
import { forEachCompany, withTenantContext } from '../src/lib/db';
import { ensureChartOfAccounts } from '../src/lib/services/chart-of-accounts';

async function main() {
  const porEmpresa = await forEachCompany((tx) =>
    tx.condominium.findMany({ where: { deletedAt: null }, select: { id: true } })
  );
  const condos = porEmpresa.flatMap((r) => r.result.map((c) => ({ id: c.id, companyId: r.companyId })));

  console.log(`Condominios encontrados: ${condos.length}\n`);

  let totalCreadas = 0;
  let condosActualizados = 0;

  for (const condo of condos) {
    const creadas = await withTenantContext(condo.companyId, (tx) =>
      ensureChartOfAccounts(tx, condo.id, condo.companyId)
    );
    if (creadas > 0) {
      condosActualizados++;
      totalCreadas += creadas;
      console.log(`  ${condo.id}: +${creadas} cuenta(s)`);
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Condominios revisados: ${condos.length}`);
  console.log(`Condominios con cuentas nuevas: ${condosActualizados}`);
  console.log(`Cuentas creadas en total: ${totalCreadas}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
