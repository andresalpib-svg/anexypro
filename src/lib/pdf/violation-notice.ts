import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { isSafePng, isSafeJpeg, embedSafeImage } from '@/lib/image-safety';

/**
 * Documento formal de incumplimiento: notificación de advertencia o
 * resolución de multa.
 *
 * El usuario no edita nada. Esta función recibe el texto ya resuelto
 * —las variables las sustituye el motor de dominio— y lo maqueta.
 *
 * DOS LÍMITES DE pdf-lib QUE HAY QUE TENER PRESENTES:
 *
 * 1. Con las fuentes estándar solo escribe WinAnsi. Los acentos y la
 *    eñe entran sin problema, pero el símbolo ₡ NO existe en esa tabla
 *    y revienta la generación: los montos se rotulan "CRC 25 000,00".
 *    Cualquier carácter fuera de WinAnsi que llegue en un nombre o una
 *    observación se sustituye antes de dibujar (ver `winAnsi`).
 *
 * 2. `embedPng` entra en bucle infinito con un PNG corrupto —no lanza,
 *    se come la CPU y cuelga el proceso—. Por eso toda imagen pasa
 *    antes por `isSafePng`/`isSafeJpeg`.
 */

// A4/MARGIN/ANCHO y `wrap` se exportan: los reutiliza cualquier otro
// generador de PDF del sistema (ver `src/lib/pdf/account-statement.ts`)
// para que dos documentos formales no midan la página distinto.
export const A4: [number, number] = [595.28, 841.89];
export const MARGIN = 52;
export const ANCHO = A4[0] - MARGIN * 2;

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.45, 0.48, 0.55);
const LINE = rgb(0.85, 0.87, 0.9);
const DANGER = rgb(0.75, 0.16, 0.16);

export type EvidenceImage = { data: Buffer; ext: string; caption?: string };

export type NoticeInput = {
  kind: 'advertencia' | 'multa';
  /** 1.ª, 2.ª… solo para advertencias. */
  sequence: number;
  caseNumber: string;
  condominiumName: string;
  propertyCode: string;
  ownerName: string;
  violationName: string;
  regulationArticle?: string | null;
  issuedAt: Date;
  bodyText: string;
  observation?: string | null;
  fineAmount?: number | null;
  currency: string;
  responseDays: number;
  supervisorName?: string | null;
  adminName?: string | null;
  /** Identidad del documento (membrete y firma). */
  branding: {
    primaryColor: string;
    headerText?: string | null;
    footerText?: string | null;
    adminDetails?: string | null;
    signerName?: string | null;
    signerTitle?: string | null;
    logo?: { data: Buffer; ext: string } | null;
  };
  images: EvidenceImage[];
};

/** #RRGGBB → RGB de pdf-lib. Si el color no es válido, azul de la marca. */
function parseColor(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return rgb(0.23, 0.43, 0.96);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Deja el texto en caracteres que WinAnsi sepa dibujar.
 *
 * Sustituye lo habitual (comillas tipográficas, guiones largos, el
 * símbolo de colón) y descarta el resto en vez de dejar que pdf-lib
 * lance a mitad de la generación: un documento con un guion distinto es
 * mejor que ningún documento.
 */
export function winAnsi(text: string): string {
  return text
    .replace(/[₡]/g, 'CRC ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Todo lo que quede fuera de latin-1 se descarta.
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');
}

/**
 * Monto con el formato de Costa Rica: punto para los miles, coma para
 * los decimales.
 *
 * Se arma a mano y no con `toLocaleString`, que según la versión de
 * Node separa los miles con un espacio fino (U+202F). Ese carácter no
 * existe en WinAnsi, así que `winAnsi` lo borraría y el documento
 * mostraría "CRC 25000,00". El formato de un monto en una resolución de
 * multa no puede depender del entorno donde corra el servidor.
 */
export function money(n: number, currency: string): string {
  const signo = n < 0 ? '-' : '';
  const [entero = '0', decimales = '00'] = Math.abs(n).toFixed(2).split('.');
  // Separador de miles: espacio NORMAL, como el resto del sistema
  // ("₡25 000,00"). Antes era un punto y el residente veía en su portal
  // "CRC 25.000,00", con un formato que no aparece en ninguna otra
  // pantalla. No se puede usar `toLocaleString('es-CR')` porque separa
  // con espacio fino (U+202F) y ese carácter no existe en WinAnsi: el
  // PDF revienta. El símbolo se deja como "CRC" por la misma razón —
  // ₡ tampoco está en WinAnsi— y este texto es el mismo que firma el
  // documento formal, así que debe coincidir con el del PDF.
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${currency} ${signo}${miles},${decimales}`;
}

/** Parte el texto en líneas que caben en `maxWidth`. Respeta los saltos escritos. */
export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const parrafo of winAnsi(text).split('\n')) {
    if (!parrafo.trim()) {
      out.push('');
      continue;
    }
    let linea = '';
    for (const palabra of parrafo.split(/\s+/)) {
      const tentativa = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(tentativa, size) <= maxWidth) {
        linea = tentativa;
      } else {
        if (linea) out.push(linea);
        linea = palabra;
      }
    }
    if (linea) out.push(linea);
  }
  return out;
}

export async function buildViolationNoticePdf(input: NoticeInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = parseColor(input.branding.primaryColor);

  let page = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const nuevaPagina = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const espacio = (alto: number) => {
    if (y - alto < MARGIN + 40) nuevaPagina();
  };
  const texto = (
    t: string,
    opts: { size?: number; font?: PDFFont; color?: RGB; x?: number } = {}
  ) => {
    const size = opts.size ?? 10;
    page.drawText(winAnsi(t), {
      x: opts.x ?? MARGIN,
      y,
      size,
      font: opts.font ?? regular,
      color: opts.color ?? INK,
    });
  };

  // ---------- Membrete ----------
  if (input.branding.logo) {
    const { data, ext } = input.branding.logo;
    try {
      const img = await embedSafeImage(pdf, ext, data);
      if (img) {
        const alto = 38;
        const ancho = (img.width / img.height) * alto;
        page.drawImage(img, { x: MARGIN, y: y - alto, width: Math.min(ancho, 150), height: alto });
        y -= alto + 8;
      }
    } catch {
      // Un logo ilegible no puede impedir que salga la notificación.
    }
  }

  y -= 4;
  texto(input.condominiumName, { size: 15, font: bold });
  y -= 15;
  if (input.branding.headerText) {
    for (const l of wrap(input.branding.headerText, regular, 8.5, ANCHO)) {
      texto(l, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 2, color });
  y -= 26;

  // ---------- Título ----------
  const titulo =
    input.kind === 'multa'
      ? 'RESOLUCIÓN DE MULTA'
      : `NOTIFICACIÓN DE INCUMPLIMIENTO${input.sequence > 1 ? ` — ${input.sequence}.ª ADVERTENCIA` : ''}`;
  texto(titulo, { size: 13, font: bold, color: input.kind === 'multa' ? DANGER : INK });
  y -= 16;
  texto(`Expediente ${input.caseNumber}`, { size: 9, color: MUTED });
  y -= 22;

  // ---------- Datos ----------
  const fecha = input.issuedAt.toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  });
  const hora = input.issuedAt.toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Costa_Rica',
  });

  const filas: [string, string][] = [
    ['Propietario', input.ownerName],
    ['Filial', input.propertyCode],
    ['Condominio', input.condominiumName],
    ['Incumplimiento', input.violationName],
  ];
  if (input.regulationArticle) filas.push(['Reglamento', input.regulationArticle]);
  filas.push(['Fecha y hora', `${fecha}, ${hora}`]);

  for (const [etiqueta, valor] of filas) {
    espacio(16);
    texto(etiqueta, { size: 9, color: MUTED });
    const lineas = wrap(valor, regular, 10, ANCHO - 120);
    lineas.forEach((l, i) => {
      page.drawText(winAnsi(l), { x: MARGIN + 115, y: y - i * 12, size: 10, font: regular, color: INK });
    });
    y -= Math.max(14, lineas.length * 12 + 2);
  }

  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: LINE });
  y -= 20;

  // ---------- Cuerpo ----------
  for (const linea of wrap(input.bodyText, regular, 10.5, ANCHO)) {
    espacio(15);
    if (linea) texto(linea, { size: 10.5 });
    y -= 15;
  }

  // ---------- Monto ----------
  if (input.kind === 'multa' && input.fineAmount != null) {
    y -= 8;
    espacio(40);
    page.drawRectangle({
      x: MARGIN,
      y: y - 26,
      width: ANCHO,
      height: 34,
      color: rgb(0.99, 0.94, 0.94),
      borderColor: DANGER,
      borderWidth: 0.8,
    });
    page.drawText('MONTO DE LA MULTA', { x: MARGIN + 12, y: y - 6, size: 8.5, font: bold, color: DANGER });
    const monto = money(input.fineAmount, input.currency);
    page.drawText(winAnsi(monto), {
      x: A4[0] - MARGIN - 12 - bold.widthOfTextAtSize(winAnsi(monto), 13),
      y: y - 10,
      size: 13,
      font: bold,
      color: DANGER,
    });
    y -= 44;
  }

  // ---------- Observación ----------
  if (input.observation?.trim()) {
    y -= 6;
    espacio(30);
    texto('Observación de quien reporta', { size: 9, font: bold, color: MUTED });
    y -= 14;
    for (const l of wrap(input.observation, regular, 10, ANCHO)) {
      espacio(14);
      texto(l, { size: 10 });
      y -= 13;
    }
  }

  // ---------- Evidencias ----------
  const utiles = input.images.filter((img) =>
    img.ext === '.png' ? isSafePng(img.data) : isSafeJpeg(img.data)
  );
  if (utiles.length > 0) {
    y -= 14;
    espacio(30);
    texto(`Evidencia fotográfica (${utiles.length})`, { size: 9, font: bold, color: MUTED });
    y -= 8;

    const COLS = 2;
    const GAP = 12;
    const anchoCelda = (ANCHO - GAP * (COLS - 1)) / COLS;
    const altoCelda = 150;

    for (let i = 0; i < utiles.length; i += COLS) {
      espacio(altoCelda + 16);
      const fila = utiles.slice(i, i + COLS);
      for (let c = 0; c < fila.length; c++) {
        const img = fila[c];
        if (!img) continue;
        try {
          const emb = await embedSafeImage(pdf, img.ext, img.data);
          if (emb) {
            const escala = Math.min(anchoCelda / emb.width, altoCelda / emb.height);
            const w = emb.width * escala;
            const h = emb.height * escala;
            const x = MARGIN + c * (anchoCelda + GAP) + (anchoCelda - w) / 2;
            page.drawImage(emb, { x, y: y - h - 8, width: w, height: h });
          }
        } catch {
          // Una foto que no se puede incrustar no invalida el documento.
        }
      }
      y -= altoCelda + 16;
    }
  }

  // ---------- Plazo y firma ----------
  y -= 10;
  espacio(90);
  if (input.kind === 'advertencia') {
    for (const l of wrap(
      `Se le concede un plazo de ${input.responseDays} días hábiles para corregir la situación descrita. ` +
        `De persistir el incumplimiento, la Administración continuará con el procedimiento establecido en el reglamento del condominio.`,
      regular,
      9.5,
      ANCHO
    )) {
      texto(l, { size: 9.5, color: MUTED });
      y -= 12;
    }
  }

  y -= 34;
  espacio(60);
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 190, y }, thickness: 0.8, color: INK });
  y -= 13;
  if (input.branding.signerName) {
    texto(input.branding.signerName, { size: 10, font: bold });
    y -= 12;
  }
  if (input.branding.signerTitle) {
    texto(input.branding.signerTitle, { size: 9, color: MUTED });
    y -= 12;
  }
  if (input.adminName) {
    texto(input.adminName, { size: 9, color: MUTED });
    y -= 12;
  }
  if (input.supervisorName) {
    texto(`Reportado por: ${input.supervisorName}`, { size: 8.5, color: MUTED });
    y -= 12;
  }

  // ---------- Pie en todas las páginas ----------
  const pie = input.branding.footerText ?? input.branding.adminDetails ?? '';
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 14 },
      end: { x: A4[0] - MARGIN, y: MARGIN - 14 },
      thickness: 0.5,
      color: LINE,
    });
    if (pie) {
      p.drawText(winAnsi(pie).slice(0, 120), {
        x: MARGIN,
        y: MARGIN - 26,
        size: 7.5,
        font: regular,
        color: MUTED,
      });
    }
    const num = `${i + 1} / ${paginas.length}`;
    p.drawText(num, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(num, 7.5),
      y: MARGIN - 26,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return Buffer.from(await pdf.save());
}
