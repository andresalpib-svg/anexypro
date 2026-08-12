/**
 * Eliminación FÍSICA de los archivos de Drive de UNA cuenta DEMO
 * (PASO 9) — invocación manual y controlada. NO forma parte del
 * programador diario (`src/lib/jobs/index.ts`): esta función no está
 * registrada ahí a propósito, así que nada la dispara sola todavía.
 *
 *   npx tsx scripts/purgar-demo.ts <companyId>              # purga real
 *   npx tsx scripts/purgar-demo.ts <companyId> --dry         # solo informa qué haría
 *   npx tsx scripts/purgar-demo.ts <companyId> --force       # salta la fecha del día 18 (pruebas)
 *
 * `--dry` NO llama a `purgeDemoDriveFiles`: en su lugar imprime el
 * estado actual de la demo y si `evaluatePurgeEligibility` la dejaría
 * pasar ahora mismo, sin tocar ni el proveedor ni la base.
 */
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)="?(.*?)"?$/);
  if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2] ?? '';
}

async function main() {
  const companyId = process.argv[2];
  const dry = process.argv.includes('--dry');
  const force = process.argv.includes('--force');

  if (!companyId || companyId.startsWith('--')) {
    console.error('Uso: npx tsx scripts/purgar-demo.ts <companyId> [--dry] [--force]');
    process.exit(1);
  }

  const { prisma } = await import('../src/lib/db');
  const { evaluatePurgeEligibility } = await import('../src/lib/domain/demo-cleanup');

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      legalName: true,
      isDemo: true,
      demoStatus: true,
      demoDeleteScheduledAt: true,
      demoDriveFolderId: true,
      demoDriveFolderName: true,
    },
  });
  if (!company) {
    console.error(`No existe ninguna empresa con id ${companyId}.`);
    process.exit(1);
  }

  console.log(`Empresa: ${company.legalName} (${company.id})`);
  console.log(`  isDemo: ${company.isDemo} · demoStatus: ${company.demoStatus ?? '—'}`);
  console.log(`  demoDeleteScheduledAt: ${company.demoDeleteScheduledAt?.toISOString() ?? '—'}`);
  console.log(`  carpeta de Drive: ${company.demoDriveFolderName ?? '—'} (${company.demoDriveFolderId ?? 'sin carpeta'})`);

  const now = new Date();
  const elegibilidad = evaluatePurgeEligibility({
    isDemo: company.isDemo,
    demoStatus: company.demoStatus,
    demoDeleteScheduledAt: company.demoDeleteScheduledAt,
    now,
    force,
  });
  console.log(`\nElegibilidad ahora mismo (${now.toISOString()}): ${elegibilidad.allowed ? 'SÍ se puede purgar' : 'NO — ' + elegibilidad.reason}`);

  if (dry || !elegibilidad.allowed) {
    await prisma.$disconnect();
    if (!elegibilidad.allowed) process.exit(1);
    return; // --dry: solo informar, nunca borrar.
  }

  console.log('\n⚠️  Esto va a borrar FÍSICAMENTE los archivos de Drive de esta demo. Continuando en 3 segundos...');
  await new Promise((r) => setTimeout(r, 3000));

  const { purgeDemoDriveFiles } = await import('../src/lib/services/demo-cleanup');
  const resultado = await purgeDemoDriveFiles(companyId, {
    actor: { userId: null, userName: 'Script manual (purgar-demo.ts)' },
    force,
    now,
  });

  console.log(`\nResultado: ${resultado.status.toUpperCase()}`);
  console.log(`  ${resultado.summary}`);
  console.log(
    `  archivos: ${resultado.filesDeleted}/${resultado.filesFound} · carpetas: ${resultado.foldersDeleted}/${resultado.foldersFound} · fallos: ${resultado.failed.length}`
  );
  if (resultado.failed.length) {
    console.log('\n  Fallos:');
    for (const f of resultado.failed) console.log(`    - [${f.kind}] ${f.name} (${f.providerId}): ${f.motivo}`);
  }

  await prisma.$disconnect();
  process.exit(resultado.status === 'fallido' ? 1 : 0);
}

main().catch((e) => {
  console.error('FALLA:', e?.message ?? e);
  process.exit(1);
});
