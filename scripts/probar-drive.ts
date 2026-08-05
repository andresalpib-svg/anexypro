/**
 * Prueba de conexión real contra Google Drive con las credenciales del
 * entorno: healthCheck, carpeta raíz, subir, descargar, metadatos,
 * renombrar y eliminar. No toca la base de datos.
 *
 *   npx tsx scripts/probar-drive.ts
 */
import fs from 'node:fs';
import { GoogleDriveProvider } from '../src/lib/storage/google-drive-provider';

// tsx no carga .env solo; se leen las dos variables necesarias.
for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^(GOOGLE_DRIVE_[A-Z_]+)="?(.*?)"?$/);
  if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2] ?? '';
}

// Mismo criterio que la fábrica: OAuth de usuario primero (Drive
// personal); la cuenta de servicio queda para unidades compartidas.
const provider = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
  ? new GoogleDriveProvider({
      oauthClientId: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID!,
      oauthClientSecret: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET!,
      oauthRefreshToken: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN!,
    })
  : new GoogleDriveProvider({
      clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL!,
      privateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY!,
    });

async function main() {
  const salud = await provider.healthCheck();
  console.log(`healthCheck: ${salud.ok ? 'OK' : 'FALLA'} — ${salud.detail}`);
  if (!salud.ok) process.exit(1);

  // La raíz debe encontrar la carpeta COMPARTIDA (no crear otra).
  const root = await provider.createFolder('ANEXYpro');
  console.log(`raíz: ${root.name} (${root.id})`);

  const sub = await provider.createFolder('Prueba de conexión', root.id);
  const subido = await provider.uploadFile({
    name: 'prueba.txt',
    mimeType: 'text/plain',
    parentId: sub.id,
    data: Buffer.from('ANEXYpro — prueba de conexión con Google Drive.'),
  });
  console.log(`subido: ${subido.name} (${subido.sizeBytes} bytes)`);

  const bajado = await provider.downloadFile(subido.id);
  console.log(`descargado: ${bajado.length} bytes — íntegro: ${bajado.toString().includes('ANEXYpro')}`);

  await provider.renameFile(subido.id, 'prueba-renombrada.txt');
  const meta = await provider.getMetadata(subido.id);
  console.log(`renombrado y metadatos: ${meta?.name}`);

  await provider.deleteFile(subido.id);
  console.log('eliminado (a la papelera): OK');
  console.log('\nTODO OK — Drive listo para activarse como proveedor.');
}

main().catch((e) => { console.error('FALLA:', e.message); process.exit(1); });
