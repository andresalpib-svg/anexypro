import { PDFDocument, StandardFonts, rgb, type PDFFont, type RGB } from 'pdf-lib';
import { embedSafeImage } from '@/lib/image-safety';
import { A4, MARGIN, ANCHO, winAnsi, money } from '@/lib/pdf/violation-notice';
import { fechaSolo } from '@/lib/fecha-local';

/**
 * Estado de cuenta de UNA filial, en PDF — lo adjunta
 * `sendAccountStatementEmail` (`src/lib/services/account-statements.ts`)
 * al correo que se envía desde el módulo administrativo. Antes ese
 * correo llevaba el estado de cuenta como HTML embebido; ahora el
 * correo es una nota corta y el documento formal va adjunto, con el
 * mismo criterio de "un PDF real, no una tabla en el cuerpo del
 * correo" que ya usan las notificaciones de incumplimiento.
 *
 * Reutiliza de `violation-notice.ts` las mismas medidas de página
 * (A4/MARGIN/ANCHO), el mismo saneamiento de texto (`winAnsi`, porque
 * ₡ no existe en WinAnsi) y el mismo formateo de monto (`money`, para
 * no depender de `toLocaleString` — ver el porqué en ese archivo).
 */

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.45, 0.48, 0.55);
const LINE = rgb(0.85, 0.87, 0.9);
const OK = rgb(0.11, 0.5, 0.35);
const DANGER = rgb(0.75, 0.16, 0.16);

export type AccountStatementLogo = { data: Buffer; ext: string };

export type AccountStatementRow = {
  date: Date;
  desc: string;
  reference: string;
  charge: number;
  credit: number;
};

export type AccountStatementInput = {
  condominiumName: string;
  propertyCode: string;
  ownerName: string | null;
  currency: string;
  issuedAt: Date;
  snapshot: {
    charged: number;
    paid: number;
    balance: number;
    overdueCount: number;
    overdueAmount: number;
    isCurrent: boolean;
  };
  /** Ya en orden cronológico (el más antiguo primero) — no se reordena acá. */
  movements: AccountStatementRow[];
  /**
   * ÚNICAMENTE estos dos logos van en el documento — el del condominio
   * (plantilla de Emisión de Documentos, o el del condominio si no hay
   * plantilla propia) y el de la empresa administradora. Ninguno es
   * obligatorio: un logo faltante o ilegible no impide emitir el
   * estado de cuenta.
   */
  condoLogo?: AccountStatementLogo | null;
  companyLogo?: AccountStatementLogo | null;
};

/** Recorta el texto (con "…") hasta que quepa en `maxWidth`. */
function truncar(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const limpio = winAnsi(text);
  if (font.widthOfTextAtSize(limpio, size) <= maxWidth) return limpio;
  let out = limpio;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

// Columnas de la tabla de movimientos — mismo orden que el histórico
// del panel (Fecha / Descripción / Referencia / Cobro / Pago / Saldo),
// sin la columna "Asociado a" (ese detalle ya vive en la Descripción).
const COL_FECHA = 50;
const COL_REF = 55;
const COL_COBRO = 62;
const COL_PAGO = 62;
const COL_SALDO = 68;
const COL_DESC = ANCHO - COL_FECHA - COL_REF - COL_COBRO - COL_PAGO - COL_SALDO;

export async function buildAccountStatementPdf(input: AccountStatementInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const nuevaPagina = () => {
    page = pdf.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const espacio = (alto: number) => {
    if (y - alto < MARGIN + 40) nuevaPagina();
  };
  const texto = (t: string, opts: { size?: number; font?: PDFFont; color?: RGB; x?: number } = {}) => {
    page.drawText(winAnsi(t), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? regular,
      color: opts.color ?? INK,
    });
  };
  /** Dibuja texto alineado a la derecha en `x + width`. */
  const textoDerecha = (t: string, x: number, width: number, opts: { size?: number; font?: PDFFont; color?: RGB } = {}) => {
    const size = opts.size ?? 9;
    const font = opts.font ?? regular;
    const s = winAnsi(t);
    page.drawText(s, { x: x + width - font.widthOfTextAtSize(s, size), y, size, font, color: opts.color ?? INK });
  };

  // ---------- Membrete: únicamente el logo del condominio y el de la empresa ----------
  const logoAlto = 34;
  let huboLogo = false;
  const dibujarLogo = async (logo: AccountStatementLogo | null | undefined, alineado: 'izquierda' | 'derecha') => {
    if (!logo) return;
    try {
      const img = await embedSafeImage(pdf, logo.ext, logo.data);
      if (!img) return;
      const ancho = Math.min((img.width / img.height) * logoAlto, 140);
      const x = alineado === 'izquierda' ? MARGIN : A4[0] - MARGIN - ancho;
      page.drawImage(img, { x, y: y - logoAlto, width: ancho, height: logoAlto });
      huboLogo = true;
    } catch {
      // Un logo ilegible no puede impedir que salga el estado de cuenta.
    }
  };
  await dibujarLogo(input.condoLogo, 'izquierda');
  await dibujarLogo(input.companyLogo, 'derecha');
  if (huboLogo) y -= logoAlto + 10;

  texto(input.condominiumName, { size: 14, font: bold });
  y -= 15;
  texto(`Filial ${input.propertyCode}${input.ownerName ? ` · ${input.ownerName}` : ''}`, { size: 9.5, color: MUTED });
  y -= 10;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1.2, color: rgb(0.23, 0.43, 0.96) });
  y -= 24;

  // ---------- Título ----------
  texto('ESTADO DE CUENTA', { size: 13, font: bold });
  y -= 14;
  const emitido = input.issuedAt.toLocaleDateString('es-CR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Costa_Rica',
  });
  texto(`Emitido el ${emitido}`, { size: 8.5, color: MUTED });
  y -= 22;

  // ---------- Situación ----------
  espacio(30);
  const alDia = input.snapshot.isCurrent;
  const colorSituacion = alDia ? OK : DANGER;
  page.drawRectangle({
    x: MARGIN,
    y: y - 22,
    width: ANCHO,
    height: 28,
    color: alDia ? rgb(0.93, 0.98, 0.95) : rgb(0.99, 0.94, 0.94),
    borderColor: colorSituacion,
    borderWidth: 0.8,
  });
  texto(alDia ? 'AL DÍA' : 'EN ATRASO', { x: MARGIN + 12, size: 10.5, font: bold, color: colorSituacion });
  const detalleSituacion = alDia
    ? 'No tiene cobros vencidos pendientes.'
    : `${input.snapshot.overdueCount} cobro(s) vencido(s) por ${money(input.snapshot.overdueAmount, input.currency)}.`;
  const dSize = 8.5;
  const dTexto = winAnsi(detalleSituacion);
  page.drawText(dTexto, {
    x: A4[0] - MARGIN - 12 - regular.widthOfTextAtSize(dTexto, dSize),
    y: y - 4,
    size: dSize,
    font: regular,
    color: MUTED,
  });
  y -= 40;

  // ---------- Totales ----------
  espacio(34);
  const colW = ANCHO / 3;
  const totales: [string, number, RGB][] = [
    ['MONTO COBRADO', input.snapshot.charged, INK],
    ['MONTO PAGADO', input.snapshot.paid, OK],
    ['SALDO ACTUAL', input.snapshot.balance, input.snapshot.balance > 0 ? DANGER : OK],
  ];
  totales.forEach(([etiqueta, monto, color], i) => {
    const x = MARGIN + i * colW;
    page.drawText(winAnsi(etiqueta), { x, y, size: 7.5, font: bold, color: MUTED });
    page.drawText(winAnsi(money(monto, input.currency)), { x, y: y - 14, size: 12, font: bold, color });
  });
  y -= 34;

  // ---------- Tabla de movimientos ----------
  const xFecha = MARGIN;
  const xDesc = xFecha + COL_FECHA;
  const xRef = xDesc + COL_DESC;
  const xCobro = xRef + COL_REF;
  const xPago = xCobro + COL_COBRO;
  const xSaldo = xPago + COL_PAGO;

  const encabezadoTabla = () => {
    espacio(20);
    const size = 7.5;
    page.drawText('FECHA', { x: xFecha, y, size, font: bold, color: MUTED });
    page.drawText('DESCRIPCIÓN', { x: xDesc, y, size, font: bold, color: MUTED });
    page.drawText('REFERENCIA', { x: xRef, y, size, font: bold, color: MUTED });
    textoDerecha('COBRO', xCobro, COL_COBRO, { size, font: bold, color: MUTED });
    textoDerecha('PAGO', xPago, COL_PAGO, { size, font: bold, color: MUTED });
    textoDerecha('SALDO', xSaldo, COL_SALDO, { size, font: bold, color: MUTED });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 0.6, color: LINE });
    y -= 12;
  };
  encabezadoTabla();

  const FILA = 13;
  let saldo = 0;
  if (input.movements.length === 0) {
    espacio(FILA);
    texto('Sin movimientos todavía.', { size: 9, color: MUTED });
    y -= FILA;
  }
  for (const m of input.movements) {
    saldo += m.charge - m.credit;
    const yAntes = y;
    espacio(FILA + 2);
    if (y > yAntes) encabezadoTabla(); // se rompió la página: repetir encabezado

    const size = 8.3;
    page.drawText(winAnsi(fechaSolo(m.date)), { x: xFecha, y, size, font: regular, color: MUTED });
    page.drawText(truncar(m.desc, regular, size, COL_DESC - 6), { x: xDesc, y, size, font: regular, color: INK });
    page.drawText(truncar(m.reference || '-', regular, size, COL_REF - 6), { x: xRef, y, size, font: regular, color: MUTED });
    if (m.charge > 0) textoDerecha(money(m.charge, input.currency), xCobro, COL_COBRO, { size });
    if (m.credit > 0) textoDerecha(money(m.credit, input.currency), xPago, COL_PAGO, { size, color: OK });
    textoDerecha(money(saldo, input.currency), xSaldo, COL_SALDO, { size, font: bold });
    y -= FILA;
  }

  // ---------- Pie en todas las páginas ----------
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 14 },
      end: { x: A4[0] - MARGIN, y: MARGIN - 14 },
      thickness: 0.5,
      color: LINE,
    });
    p.drawText(
      winAnsi(`Este estado de cuenta corresponde unicamente a la filial ${input.propertyCode} de ${input.condominiumName}.`).slice(0, 130),
      { x: MARGIN, y: MARGIN - 26, size: 7.5, font: regular, color: MUTED }
    );
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
