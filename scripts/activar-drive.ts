/**
 * Activa Google Drive como proveedor del repositorio, con la misma
 * verificación previa que la pantalla del master: si la conexión no
 * pasa el healthCheck, NO se activa.
 *
 *   npx tsx scripts/activar-drive.ts
 */
import fs from 'node:fs';

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^(GOOGLE_DRIVE_[A-Z_]+)="?(.*?)"?$/);
  if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2] ?? '';
}

async function main() {
  const { buildProvider, setStorageSettings, getStorageSettings } = await import('../src/lib/storage');
  const settings = await getStorageSettings();
  const provider = buildProvider('google_drive', settings.config);
  const salud = await provider.healthCheck();
  console.log('healthCheck:', salud.ok ? 'OK' : 'FALLA', '—', salud.detail);
  if (!salud.ok) process.exit(1);
  await setStorageSettings({ provider: 'google_drive' });
  console.log('Proveedor activo: google_drive');
}

main().then(() => process.exit(0));
