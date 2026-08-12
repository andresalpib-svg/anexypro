import zlib from 'node:zlib';
import type { PDFDocument, PDFImage } from 'pdf-lib';

/**
 * Validación de imágenes ANTES de entregarlas al decodificador de
 * pdf-lib.
 *
 * Motivo: el decodificador de PNG de pdf-lib entra en un bucle
 * infinito con archivos corruptos — no lanza excepción, se queda
 * girando y deja el servidor inutilizable (se reprodujo con un PNG de
 * 160 bytes con firma e IEND válidos pero IDAT truncado). Un
 * `try/catch` no protege de eso, así que la única defensa es no
 * pasarle nunca un archivo que no se haya verificado antes con código
 * nativo (zlib), que sí falla de forma limpia.
 */

/** Techo de seguridad: una factura legítima no pesa más que esto. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS_BY_COLOR_TYPE: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function isSafePng(buf: Buffer): boolean {
  if (buf.length < 45 || buf.length > MAX_IMAGE_BYTES) return false;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') return false;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24]!;
  const colorType = buf[25]!;
  const interlace = buf[28]!;

  if (!width || !height || width > 20000 || height > 20000) return false;
  // Nos limitamos a lo que pdf-lib maneja con soltura: 8 bits por
  // canal y sin entrelazado Adam7.
  if (bitDepth !== 8 || interlace !== 0) return false;
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels) return false;

  // Recorrer los chunks y juntar los IDAT.
  const idats: Buffer[] = [];
  let offset = 8;
  let sawIend = false;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('latin1');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (length > buf.length || dataEnd + 4 > buf.length) return false; // chunk truncado
    if (type === 'IDAT') idats.push(buf.subarray(dataStart, dataEnd));
    if (type === 'IEND') {
      sawIend = true;
      break;
    }
    offset = dataEnd + 4; // + CRC
  }
  if (!sawIend || idats.length === 0) return false;

  try {
    // zlib es nativo: falla limpio, nunca se queda girando.
    const raw = zlib.inflateSync(Buffer.concat(idats));
    // Cada fila lleva 1 byte de filtro. En paleta (colorType 3) el
    // ancho de fila depende de la profundidad, pero ya exigimos 8 bits.
    const expected = height * (1 + width * channels);
    return raw.length === expected;
  } catch {
    return false;
  }
}

export function isSafeJpeg(buf: Buffer): boolean {
  if (buf.length < 4 || buf.length > MAX_IMAGE_BYTES) return false;
  // SOI al inicio y EOI al final: descarta los truncados, que son el
  // caso corrupto habitual.
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  return buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
}

/**
 * Único punto de entrada para incrustar una imagen en un PDF con
 * pdf-lib. SIEMPRE valida con `isSafePng`/`isSafeJpeg` antes de llamar
 * a `embedPng`/`embedJpg` — nunca al revés.
 *
 * POR QUÉ: los 4 sitios que incrustan imágenes en un PDF hoy (informe
 * de caja chica, EEFF, notificación de incumplimiento ×2) repetían la
 * misma validación a mano antes de cada llamada — funciona, pero un
 * generador de PDF nuevo que se agregue mañana puede olvidarla sin que
 * nada lo avise, y eso reintroduce el cuelgue del servidor documentado
 * en el comentario de arriba (auditoría de seguridad 2026-08-11,
 * hallazgo #23). Centralizarlo acá hace que sea imposible olvidarlo:
 * no hay forma de incrustar una imagen sin pasar por la validación.
 *
 * Devuelve `null` si la imagen no es segura — nunca lanza.
 */
export async function embedSafeImage(pdf: PDFDocument, ext: string, bytes: Buffer): Promise<PDFImage | null> {
  const e = ext.toLowerCase();
  if (e === '.png') {
    if (!isSafePng(bytes)) return null;
    return pdf.embedPng(bytes);
  }
  if (e === '.jpg' || e === '.jpeg') {
    if (!isSafeJpeg(bytes)) return null;
    return pdf.embedJpg(bytes);
  }
  return null;
}
