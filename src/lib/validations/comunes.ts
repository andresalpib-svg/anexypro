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
