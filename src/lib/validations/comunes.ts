import { z } from 'zod';

/**
 * Validadores de fecha y hora compartidos.
 *
 * POR QUÉ EXISTEN: los formularios declaraban las fechas como
 * `z.string().min(1)` y el servicio hacía `new Date(valor)` sin
 * comprobar nada. Un valor que no es una fecha produce un `Invalid
 * Date`, que Prisma guarda o rechaza según el caso, y el usuario no ve
 * ningún error entendible. Como los campos vienen de un `<input
 * type="date">` esto no pasa usando la pantalla — pero una server
 * action es un endpoint HTTP y acepta lo que le manden.
 */

/** `AAAA-MM-DD`, comprobando que la fecha exista de verdad. */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD')
  .refine((v) => {
    // `new Date('2026-02-31')` no falla: se corre al 3 de marzo. Se
    // compara el resultado con la entrada para descartar esos casos.
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Esa fecha no existe');

/**
 * Un número de teléfono utilizable.
 *
 * POR QUÉ EXISTE: el campo era `z.string().max(30)` a secas, así que
 * entraba cualquier cosa. Los datos demo quedaron con números de nueve
 * dígitos —"87013-1071"— que no se pueden marcar; y un teléfono que no
 * sirve solo se descubre el día que hay que llamar al residente.
 *
 * Se cuenta por DÍGITOS y no por formato: la gente escribe
 * "8888-1010", "8888 1010" o "+506 8888 1010" y las tres son válidas.
 *
 * Sin código de país se exigen los 8 dígitos exactos de Costa Rica —así
 * se atrapa el error real, que es un dígito de más o de menos—. Con
 * código de país (empieza con `+`, o son 11 dígitos que arrancan en
 * 506) se admite cualquier largo de E.164, para no bloquear al
 * propietario que vive fuera.
 */
export const telefono = z
  .string()
  .max(30)
  .refine((v) => {
    const digitos = v.replace(/\D/g, '');
    const internacional = v.trim().startsWith('+') || (digitos.length === 11 && digitos.startsWith('506'));
    return internacional ? digitos.length >= 8 && digitos.length <= 15 : digitos.length === 8;
  }, 'Revisá el teléfono: en Costa Rica son 8 dígitos (ej. 8888-1010)');

/** Igual que `telefono` pero admite el campo vacío. */
export const telefonoOpcional = z.union([telefono, z.literal('')]).optional();

/** `HH:mm` en 24 horas. */
export const horaHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:mm');

/** Fecha y hora de un `<input type="datetime-local">`. */
export const fechaHoraLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Fecha y hora inválidas')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Fecha y hora inválidas');

/** Igual que `fechaISO` pero admite el campo vacío (opcional). */
export const fechaISOOpcional = z.union([fechaISO, z.literal('')]).optional();

/** Igual que `fechaHoraLocal` pero admite el campo vacío. */
export const fechaHoraLocalOpcional = z.union([fechaHoraLocal, z.literal('')]).optional();

/**
 * URL de enlace externo. `z.string().url()` acepta `javascript:` y
 * `data:`, que renderizados en un `href` son ejecución de código en el
 * origen de la aplicación. Solo se admite http(s).
 */
export const urlExterna = z
  .string()
  .url('Poné una dirección válida')
  .refine((v) => {
    try {
      return ['http:', 'https:'].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, 'La dirección debe empezar por http:// o https://');
