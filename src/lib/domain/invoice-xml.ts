/**
 * Lectura del XML de factura electrónica de Hacienda (Costa Rica).
 *
 * En Costa Rica el proveedor NO manda una foto de la factura: manda el
 * XML aceptado por Hacienda más su representación en PDF. Ese XML es
 * un documento estructurado y exacto, así que leerlo evita por
 * completo el reconocimiento óptico: cero errores de lectura, cero
 * dependencia de un servicio externo.
 *
 * Soporta los esquemas 4.3 y 4.4 (FacturaElectronica, TiqueteElectronico,
 * NotaCredito y NotaDebito), cuyos nombres de campo relevantes no
 * cambiaron entre versiones.
 *
 * Se hace con expresiones regulares en vez de un analizador XML
 * completo a propósito: no se ejecuta nada del documento, solo se
 * extraen valores de etiquetas conocidas. Un XML hostil no puede
 * hacer más que no coincidir.
 */

export type ParsedInvoice = {
  /** Clave numérica de 50 dígitos. */
  clave: string | null;
  consecutive: string | null;
  issueDate: Date | null;
  emitterName: string | null;
  emitterTaxId: string | null;
  receiverName: string | null;
  receiverTaxId: string | null;
  currency: string;
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  /** Descripción tomada de las líneas de detalle. */
  summary: string | null;
  lineCount: number;
};

/** Extrae el contenido de la primera etiqueta con ese nombre. */
function tag(xml: string, name: string): string | null {
  // [^>]* permite atributos; el nombre se ancla para no capturar
  // "TotalComprobante" cuando se busca "Total".
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const value = m[1]!.trim();
  return value.length > 0 ? value : null;
}

function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'gi');
  return [...xml.matchAll(re)].map((m) => m[1]!.trim());
}

function num(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&'); // al final, para no re-decodificar
}

export function parseInvoiceXml(xml: string): ParsedInvoice | null {
  // Debe parecer un comprobante electrónico costarricense.
  if (!/Factura|Tiquete|NotaCredito|NotaDebito|Clave/i.test(xml)) return null;

  const emisor = xml.match(/<(?:\w+:)?Emisor[\s\S]*?<\/(?:\w+:)?Emisor>/i)?.[0] ?? '';
  const receptor = xml.match(/<(?:\w+:)?Receptor[\s\S]*?<\/(?:\w+:)?Receptor>/i)?.[0] ?? '';
  const resumen = xml.match(/<(?:\w+:)?ResumenFactura[\s\S]*?<\/(?:\w+:)?ResumenFactura>/i)?.[0] ?? xml;

  const fecha = tag(xml, 'FechaEmision');
  const issueDate = fecha ? new Date(fecha) : null;

  // El contenedor de cada línea es <LineaDetalle> y la descripción
  // vive en su <Detalle> interno. Ojo con no confundir <Detalle> con
  // <DetalleServicio>, que es el contenedor de todas las líneas.
  const detalles = tagAll(xml, 'LineaDetalle');
  const descripciones = detalles
    .map((linea) => tag(linea, 'Detalle'))
    .filter((d): d is string => Boolean(d))
    .map(decodeEntities);

  // El total de impuesto puede venir como TotalImpuesto en el resumen.
  const taxTotal = num(tag(resumen, 'TotalImpuesto'));
  const total = num(tag(resumen, 'TotalComprobante'));
  // Base: el neto gravado + exento. Si no vienen, se deriva del total.
  const gravado = num(tag(resumen, 'TotalGravado')) ?? 0;
  const exento = num(tag(resumen, 'TotalExento')) ?? 0;
  const exonerado = num(tag(resumen, 'TotalExonerado')) ?? 0;
  const venta = num(tag(resumen, 'TotalVentaNeta'));
  const subtotal =
    venta ?? (gravado + exento + exonerado > 0 ? gravado + exento + exonerado : total !== null ? total - (taxTotal ?? 0) : null);

  return {
    clave: tag(xml, 'Clave'),
    consecutive: tag(xml, 'NumeroConsecutivo'),
    issueDate: issueDate && !Number.isNaN(issueDate.getTime()) ? issueDate : null,
    emitterName: emisor ? decodeEntities(tag(emisor, 'Nombre') ?? '') || null : null,
    emitterTaxId: emisor ? tag(emisor, 'Numero') : null,
    receiverName: receptor ? decodeEntities(tag(receptor, 'Nombre') ?? '') || null : null,
    receiverTaxId: receptor ? tag(receptor, 'Numero') : null,
    currency: tag(resumen, 'CodigoMoneda') ?? 'CRC',
    subtotal: subtotal !== null ? Math.round(subtotal * 100) / 100 : null,
    taxTotal: taxTotal !== null ? Math.round(taxTotal * 100) / 100 : null,
    total: total !== null ? Math.round(total * 100) / 100 : null,
    summary: descripciones.length > 0 ? descripciones.slice(0, 3).join(' · ').slice(0, 250) : null,
    lineCount: detalles.length,
  };
}
