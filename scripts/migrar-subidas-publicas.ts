/**
 * Mueve al repositorio privado los archivos que quedaron en
 * `public/uploads/` antes de que existiera el repositorio.
 *
 * POR QUÉ: mientras el archivo siga en `public/`, Next lo sirve a
 * cualquiera que conozca la URL — sin sesión y sin verificar permisos.
 * Cambiar el código de subida no basta: lo ya subido sigue expuesto.
 *
 * QUÉ HACE: por cada columna de la base que guarda `/uploads/...`,
 * lee el archivo del disco, lo sube a la carpeta que le corresponde en
 * el repositorio y reescribe la columna con `/api/archivo/<id>`.
 * Al final borra el archivo físico de `public/uploads/`.
 *
 * Es idempotente: una segunda corrida no encuentra nada que migrar.
 * Con `--dry` solo informa lo que haría.
 *
 *   npx tsx scripts/migrar-subidas-publicas.ts [--dry]
 */
import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db';
import { uploadToFolder, folderBySlug, ensureCompanyFolder } from '../src/lib/services/storage';
import { guessMime } from '../src/lib/storage/local-provider';
import type { Actor } from '../src/lib/storage/permissions';

const DRY = process.argv.includes('--dry');
const PUBLIC_DIR = path.join(process.cwd(), 'public');

type Row = { id: string; url: string };
type Target = { folderId: string; ownerPersonId?: string | null };

/**
 * Dónde va cada columna. Los destinos son exactamente los mismos que
 * usan hoy los puntos de subida ya convertidos, para que lo antiguo y
 * lo nuevo terminen en la misma carpeta.
 */
const SOURCES: Array<{
  table: string;
  column: string;
  label: string;
  resolve: (companyId: string, rowId: string) => Promise<Target>;
}> = [
  {
    table: 'admin_task_attachments',
    column: 'file_url',
    label: 'Adjuntos de tareas',
    resolve: async (companyId, rowId) => {
      const att = await prisma.adminTaskAttachment.findUniqueOrThrow({
        where: { id: rowId },
        select: { task: { select: { condominiumId: true } } },
      });
      const condoId = att.task.condominiumId;
      return {
        folderId: condoId
          ? (await folderBySlug(companyId, condoId, 'administracion')).id
          : (await ensureCompanyFolder(companyId, 'tareas', 'Adjuntos de tareas')).id,
      };
    },
  },
  {
    table: 'assets',
    column: 'photo_url',
    label: 'Fotos de activos',
    resolve: async (companyId, rowId) => {
      const a = await prisma.asset.findUniqueOrThrow({
        where: { id: rowId },
        select: { condominiumId: true },
      });
      return { folderId: (await folderBySlug(companyId, a.condominiumId, 'multimedia/fotografias')).id };
    },
  },
  {
    table: 'communication_attachments',
    column: 'file_url',
    label: 'Adjuntos de comunicados',
    resolve: async (companyId, rowId) => {
      const att = await prisma.communicationAttachment.findUniqueOrThrow({
        where: { id: rowId },
        select: { communication: { select: { condominiumId: true } } },
      });
      return {
        folderId: (await folderBySlug(companyId, att.communication.condominiumId, 'administracion/comunicados')).id,
      };
    },
  },
  {
    table: 'document_versions',
    column: 'file_url',
    label: 'Versiones de documentos',
    resolve: async (companyId, rowId) => {
      const v = await prisma.documentVersion.findUniqueOrThrow({
        where: { id: rowId },
        select: { document: { select: { condominiumId: true } } },
      });
      return { folderId: (await folderBySlug(companyId, v.document.condominiumId, 'administracion')).id };
    },
  },
  {
    table: 'expenses',
    column: 'document_url',
    label: 'Facturas de gastos',
    resolve: async (companyId, rowId) => {
      const e = await prisma.expense.findUniqueOrThrow({
        where: { id: rowId },
        select: { condominiumId: true },
      });
      return { folderId: (await folderBySlug(companyId, e.condominiumId, 'facturas')).id };
    },
  },
  {
    table: 'petty_cash_expenses',
    column: 'invoice_url',
    label: 'Facturas de caja chica',
    resolve: async (companyId, rowId) => {
      const e = await prisma.pettyCashExpense.findUniqueOrThrow({
        where: { id: rowId },
        select: { condominiumId: true },
      });
      return { folderId: (await folderBySlug(companyId, e.condominiumId, 'facturas')).id };
    },
  },
  {
    table: 'reservations',
    column: 'receipt_url',
    label: 'Comprobantes de reservas',
    resolve: async (companyId, rowId) => {
      const r = await prisma.reservation.findUniqueOrThrow({
        where: { id: rowId },
        select: { amenity: { select: { condominiumId: true } } },
      });
      return { folderId: (await folderBySlug(companyId, r.amenity.condominiumId, 'seguridad/reservas')).id };
    },
  },
  {
    table: 'users',
    column: 'photo_url',
    label: 'Fotos de perfil',
    resolve: async (companyId) => ({
      folderId: (await ensureCompanyFolder(companyId, 'perfiles', 'Fotos de perfil')).id,
    }),
  },
  {
    table: 'visit_authorizations',
    column: 'visitor_photo_url',
    label: 'Fotos de visitantes',
    resolve: async (companyId, rowId) => {
      const v = await prisma.visitAuthorization.findUniqueOrThrow({
        where: { id: rowId },
        select: { condominiumId: true },
      });
      return { folderId: (await folderBySlug(companyId, v.condominiumId, 'seguridad/visitas')).id };
    },
  },
];

async function main() {
  // La compañía dueña de los datos. En este entorno hay una sola;
  // si hubiera varias el guion se corre una vez por cada una.
  const companies = await prisma.company.findMany({ select: { id: true, legalName: true } });
  if (companies.length !== 1) {
    console.log(`⚠ Hay ${companies.length} empresas. Migrando la primera: ${companies[0]?.legalName}`);
  }
  const first = companies[0];
  if (!first) {
    console.log('No hay ninguna empresa en la base — nada que migrar.');
    await prisma.$disconnect();
    return;
  }
  const companyId = first.id;

  // El guion corre sin sesión: actúa con los permisos del master,
  // que es quien puede escribir en cualquier carpeta.
  const actor: Actor = { role: 'master', companyId };

  const movedFiles = new Set<string>();
  let migrated = 0;
  let missing = 0;

  for (const src of SOURCES) {
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, "${src.column}" AS url FROM "${src.table}" WHERE "${src.column}" LIKE '/uploads/%'`
    );
    if (rows.length === 0) continue;
    console.log(`\n${src.label} (${src.table}.${src.column}): ${rows.length}`);

    for (const row of rows) {
      const abs = path.join(PUBLIC_DIR, row.url);
      let data: Buffer;
      try {
        data = await readFile(abs);
      } catch {
        // El registro apunta a un archivo que ya no está en disco. No
        // se inventa nada: se informa y se deja la fila como está para
        // que quede visible que ese adjunto se perdió.
        console.log(`  ✗ ${row.url} — el archivo no existe en disco, fila intacta`);
        missing++;
        continue;
      }

      const fileName = path.basename(row.url);
      if (DRY) {
        console.log(`  · ${fileName} → ${src.label} (${(data.length / 1024).toFixed(0)} KB)`);
        migrated++;
        continue;
      }

      const target = await src.resolve(companyId, row.id);
      const stored = await uploadToFolder(actor, {
        folderId: target.folderId,
        fileName,
        mimeType: guessMime(fileName),
        data,
        ownerPersonId: target.ownerPersonId ?? null,
        userName: 'Migración',
      });

      await prisma.$executeRawUnsafe(
        `UPDATE "${src.table}" SET "${src.column}" = $1 WHERE id = $2`,
        `/api/archivo/${stored.id}`,
        row.id
      );
      console.log(`  ✓ ${fileName} → /api/archivo/${stored.id}`);
      movedFiles.add(abs);
      migrated++;
    }
  }

  // Recién ahora se borra de `public/`: si algo falló arriba, el
  // archivo sigue ahí y la corrida se puede repetir.
  if (!DRY) {
    for (const abs of movedFiles) await unlink(abs).catch(() => {});
  }

  console.log(
    `\n${DRY ? '[simulación] ' : ''}${migrated} referencias migradas, ` +
      `${movedFiles.size} archivos borrados de public/uploads` +
      (missing ? `, ${missing} sin archivo en disco` : '')
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
