/**
 * Backfill: marca el destinatario (`ownerPersonId`) en las evidencias de
 * incumplimientos subidas ANTES de que existiera la carpeta propia del
 * módulo. Sin esto, el residente recibe 403 al abrir la evidencia de su
 * propia notificación desde el portal.
 *
 * Idempotente: solo toca objetos sin destinatario. Ejecutar con:
 *   npx tsx scripts/retro-destinatario-evidencias.ts [--dry]
 *
 * Usa DIRECT_URL (dueño de las tablas) porque cruza empresas.
 */
import { PrismaClient } from '@prisma/client';

const dry = process.argv.includes('--dry');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const pendientes = await prisma.$queryRawUnsafe<{ n: number }[]>(`
    SELECT count(*)::int AS n
    FROM violation_evidences ve
    JOIN violation_actions va ON va.id = ve.action_id
    JOIN violation_cases vc ON vc.id = va.case_id
    JOIN storage_objects o ON o.id = replace(ve.file_ref, '/api/archivo/', '')
    WHERE o.owner_person_id IS NULL AND vc.person_id IS NOT NULL`);
  const n = pendientes[0]?.n ?? 0;
  console.log(`Evidencias sin destinatario: ${n}`);
  if (dry || n === 0) return;

  const actualizados = await prisma.$executeRawUnsafe(`
    UPDATE storage_objects o
    SET owner_person_id = vc.person_id
    FROM violation_evidences ve
    JOIN violation_actions va ON va.id = ve.action_id
    JOIN violation_cases vc ON vc.id = va.case_id
    WHERE o.id = replace(ve.file_ref, '/api/archivo/', '')
      AND o.owner_person_id IS NULL
      AND vc.person_id IS NOT NULL`);
  console.log(`Actualizados: ${actualizados}`);
}

main().finally(() => prisma.$disconnect());
