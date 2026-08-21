/**
 * Avisa si la URL de conexión a Postgres no PIDE explícitamente TLS,
 * salvo cuando la base está en la misma máquina (desarrollo).
 *
 * POR QUÉ: DATABASE_URL/DIRECT_URL viajan con la contraseña del rol
 * incluida. Sin `sslmode=require` (o más fuerte), esa contraseña —y
 * cada fila que la aplicación lea o escriba— podría cruzar la red en
 * texto plano entre el servidor de la aplicación (Vercel) y el
 * proveedor de la base (Supabase).
 *
 * A PROPÓSITO NO LANZA EXCEPCIÓN, solo registra el aviso: esto es una
 * revisión de la URL en sí (lo que la aplicación PIDE), no de si la
 * conexión terminó cifrada de verdad — Supabase exige TLS en su
 * servidor sin importar lo que diga la URL del cliente, así que una
 * URL sin el parámetro no necesariamente significa una conexión sin
 * cifrar; tumbar el arranque por esa sola razón sería un falso
 * positivo con el peor costo posible (producción caída). La
 * comprobación que SÍ hace fallar el despliegue —porque consulta el
 * estado real de la conexión, no la URL— es
 * `scripts/verificar-bd.ts` ("Conexión a la base cifrada (TLS)"),
 * que lee `pg_stat_ssl` en tiempo de build, antes de que Vercel
 * publique la nueva versión.
 */
function esLocal(host: string | null): boolean {
  if (!host) return false;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function tieneSslExigido(url: URL): boolean {
  // El cliente de Prisma para postgresql SOLO entiende
  // "disable|prefer|require" en `sslmode` — "verify-ca"/"verify-full"
  // no están soportados (por eso no se listan acá: sugerirlos sería
  // pedirle a Prisma algo que no sabe hacer). Para exigir además que
  // valide el certificado del servidor, el parámetro de Prisma es
  // `sslaccept=strict` — ver el aviso de `scripts/verificar-bd.ts`
  // sobre el pooler de Supabase para el porqué de que esto no alcance
  // a ser, hoy, una garantía completa.
  const modo = url.searchParams.get('sslmode');
  if (modo === 'require') return true;
  // Algunos proveedores (Neon, Prisma Accelerate) usan `ssl=true` en vez
  // de `sslmode`.
  if (url.searchParams.get('ssl') === 'true') return true;
  return false;
}

function revisarUrl(nombreVariable: string, valor: string | undefined): void {
  if (!valor) return; // otra comprobación (verificar-bd.ts) ya avisa si falta.
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return; // formato inválido: lo va a rechazar Prisma con su propio error.
  }
  if (esLocal(url.hostname)) return;
  if (tieneSslExigido(url)) return;
  console.error(
    `[db-ssl-guard] Aviso: ${nombreVariable} apunta a "${url.hostname}" sin "sslmode=require" en ` +
      'la URL. Si el proveedor no exige TLS igual del lado del servidor, la conexión podría viajar ' +
      'sin cifrar. Agregar "?sslmode=require" (o "&sslmode=require" si ya tiene otros parámetros). ' +
      'El build (scripts/verificar-bd.ts) da más contexto sobre el estado real de esta conexión.'
  );
}

let yaRevisado = false;

export function exigirSslEnConexion(): void {
  if (yaRevisado) return;
  yaRevisado = true;
  revisarUrl('DATABASE_URL', process.env.DATABASE_URL);
  revisarUrl('DIRECT_URL', process.env.DIRECT_URL);
}
