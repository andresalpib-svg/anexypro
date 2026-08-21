/**
 * Cifrado de campos sensibles en reposo (AES-256-GCM).
 *
 * POR QUÉ EXISTE: `bank_accounts.account_number`, `bank_accounts.iban` y
 * `suppliers.bank_account` guardaban el número de cuenta en texto plano.
 * Row-Level Security aísla esos datos ENTRE condominios/empresas, pero no
 * protege un volcado de la base, un backup mal guardado, ni a alguien con
 * acceso directo a Postgres (soporte del proveedor, una fuga de
 * credenciales del rol `anexypro`) — auditoría de seguridad, punto 5.
 *
 * Formato guardado: "enc:v1:<base64(iv(12) + authTag(16) + ciphertext)>".
 * El prefijo de versión permite rotar el algoritmo el día que haga falta
 * sin romper lo ya cifrado. Un valor SIN ese prefijo se trata como texto
 * plano heredado (ver `decryptField`) — así el despliegue de este cambio
 * no rompe filas viejas antes de correr `scripts/cifrar-datos-bancarios.ts`.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const PREFIJO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let claveCache: Buffer | null | undefined;

/**
 * Lee y valida FIELD_ENCRYPTION_KEY de forma perezosa: recién al primer
 * cifrado/descifrado, no en cada arranque del proceso. Así un entorno que
 * nunca toca cuentas bancarias (tests unitarios, un script que no las
 * usa) no se cae por una variable que no le hace falta.
 */
function obtenerClave(): Buffer {
  if (claveCache !== undefined) {
    if (claveCache === null) throw new Error(mensajeFaltaClave());
    return claveCache;
  }
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    claveCache = null;
    throw new Error(mensajeFaltaClave());
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    claveCache = null;
    throw new Error(
      `FIELD_ENCRYPTION_KEY tiene ${buf.length} bytes tras decodificar base64; se necesitan 32 (AES-256). ` +
        'Generar una nueva con: openssl rand -base64 32'
    );
  }
  claveCache = buf;
  return buf;
}

function mensajeFaltaClave(): string {
  return (
    'Falta FIELD_ENCRYPTION_KEY: sin ella no se pueden leer ni guardar cuentas bancarias ' +
    '(número de cuenta, IBAN, cuenta del proveedor) porque van cifradas en la base. ' +
    'Generar una con: openssl rand -base64 32'
  );
}

/** Cifra un valor. `null`/`undefined`/cadena vacía pasan sin tocar. */
export function encryptField(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return valor === '' ? '' : null;
  const clave = obtenerClave();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIJO + Buffer.concat([iv, tag, cifrado]).toString('base64');
}

/**
 * Descifra un valor. Uno SIN el prefijo `enc:v1:` se devuelve tal cual
 * — dato heredado, todavía no migrado — en vez de fallar, para que el
 * despliegue de este cambio no tumbe filas que aún no pasaron por
 * `scripts/cifrar-datos-bancarios.ts`.
 */
export function decryptField(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return valor === '' ? '' : null;
  if (!valor.startsWith(PREFIJO)) return valor;
  const clave = obtenerClave();
  const datos = Buffer.from(valor.slice(PREFIJO.length), 'base64');
  const iv = datos.subarray(0, IV_BYTES);
  const tag = datos.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const cifrado = datos.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(tag);
  const plano = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  return plano.toString('utf8');
}

/** `true` si el valor ya está cifrado con este esquema (para scripts de migración). */
export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIJO);
}
