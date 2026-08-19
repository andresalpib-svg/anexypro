import { NextResponse } from 'next/server';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { canAccessCondo, getCondominium } from '@/lib/services/condominiums';
import {
  getBalanceGeneralAlCorte,
  getEstadoResultadosRango,
  type BalanceRow,
  type ResultadosRow,
} from '@/lib/services/accounting';
import { buildMonthlyReport } from '@/lib/services/monthly-report';
import { withTenantContext } from '@/lib/db';
import { isSafePng, isSafeJpeg, embedSafeImage } from '@/lib/image-safety';
import { actorFromSession, readObject } from '@/lib/services/storage';
import { objectIdFromRef } from '@/lib/services/file-refs';
import type { Actor } from '@/lib/storage/permissions';

export const dynamic = 'force-dynamic';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const HEADER_H = 64;
const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.45, 0.48, 0.55);
const ROYAL = rgb(0.16, 0.35, 0.92);
const LINE = rgb(0.85, 0.87, 0.9);

const MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * pdf-lib solo escribe WinAnsi con las fuentes estándar: el símbolo ₡
 * y el espacio fino U+202F de `toLocaleString('es-CR')` revientan la
 * generación. Todo texto pasa por aquí antes de dibujarse.
 */
function win(s: string): string {
  return s
    .replace(/₡/g, 'CRC ')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function money(n: number, currency: string): string {
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/,/g, ' ')
    .replace('.', ',');
  return `${n < 0 ? '-' : ''}${currency} ${s}`;
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

/** Parte un texto en líneas que quepan en el ancho dado. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Lee un logo del repositorio privado; null si no hay o no se puede leer. */
async function readLogo(actor: Actor, url: string | null): Promise<{ data: Buffer; ext: string } | null> {
  if (!url) return null;
  const objectId = objectIdFromRef(url);
  if (!objectId) return null;
  try {
    const obj = await readObject(actor, objectId);
    const ext = path.extname(obj.name).toLowerCase();
    if (!['.png', '.jpg', '.jpeg'].includes(ext)) return null;
    const safe = ext === '.png' ? isSafePng(obj.data) : isSafeJpeg(obj.data);
    return safe ? { data: obj.data, ext } : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new NextResponse('No autorizado', { status: 401 });
  // Los route handlers no pasan por el layout: el área se comprueba aquí.
  if (!can(session, 'finanzas')) return new NextResponse('Sin acceso a Contabilidad', { status: 403 });

  const condoId = new URL(req.url).searchParams.get('condoId');
  if (!condoId) return new NextResponse('Falta el condominio', { status: 400 });
  if (!(await canAccessCondo(session, condoId))) {
    return new NextResponse('Sin acceso a este condominio', { status: 403 });
  }

  const companyId = session.user.companyId;

  // El EEFF habla del mes ANTERIOR: el que ya cerró.
  const now = new Date();
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // último día del mes anterior
  const nombreMes = `${MES[prevStart.getUTCMonth()]} de ${prevStart.getUTCFullYear()}`;

  const [condo, company, balance, resultadosMes, resultadosAcum, informe] = await Promise.all([
    getCondominium(companyId, condoId),
    withTenantContext(companyId, (tx) =>
      tx.company.findUnique({
        where: { id: companyId },
        select: { legalName: true, tradeName: true, logoUrl: true },
      })
    ),
    getBalanceGeneralAlCorte(companyId, condoId, cutoff),
    getEstadoResultadosRango(companyId, condoId, prevStart, cutoff),
    getEstadoResultadosRango(companyId, condoId, new Date(Date.UTC(1990, 0, 1)), cutoff),
    buildMonthlyReport(companyId, condoId, now),
  ]);
  if (!condo) return new NextResponse('Condominio no encontrado', { status: 404 });

  const currency = condo.currency;
  const companyName = company?.tradeName ?? company?.legalName ?? 'Empresa administradora';

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Los logos se incrustan UNA vez y se dibujan en cada hoja.
  const actor = await actorFromSession(session);
  const embedLogo = async (raw: { data: Buffer; ext: string } | null): Promise<PDFImage | null> => {
    if (!raw) return null;
    try {
      return await embedSafeImage(pdf, raw.ext, raw.data);
    } catch {
      return null;
    }
  };
  const [condoLogo, companyLogo] = await Promise.all([
    readLogo(actor, condo.logoUrl).then(embedLogo),
    readLogo(actor, company?.logoUrl ?? null).then(embedLogo),
  ]);

  let page = pdf.addPage(A4);
  const width = page.getWidth() - MARGIN * 2;
  let y = 0;

  /**
   * Encabezado de CADA hoja: logo del condominio a la izquierda, logo
   * de la administradora a la derecha (si no hay imagen, el nombre).
   */
  const drawHeader = () => {
    const top = page.getHeight() - MARGIN;
    const logoH = 30;
    if (condoLogo) {
      const scale = Math.min(logoH / condoLogo.height, 120 / condoLogo.width);
      page.drawImage(condoLogo, {
        x: MARGIN,
        y: top - condoLogo.height * scale,
        width: condoLogo.width * scale,
        height: condoLogo.height * scale,
      });
      page.drawText(win(condo.name), { x: MARGIN, y: top - logoH - 10, size: 7.5, font, color: MUTED });
    } else {
      page.drawText(win(condo.name), { x: MARGIN, y: top - 12, size: 11, font: bold, color: INK });
    }
    if (companyLogo) {
      const scale = Math.min(logoH / companyLogo.height, 120 / companyLogo.width);
      const w = companyLogo.width * scale;
      page.drawImage(companyLogo, { x: MARGIN + width - w, y: top - companyLogo.height * scale, width: w, height: companyLogo.height * scale });
      const label = win(companyName);
      page.drawText(label, {
        x: MARGIN + width - font.widthOfTextAtSize(label, 7.5),
        y: top - logoH - 10,
        size: 7.5,
        font,
        color: MUTED,
      });
    } else {
      const label = win(companyName);
      page.drawText(label, {
        x: MARGIN + width - bold.widthOfTextAtSize(label, 10),
        y: top - 12,
        size: 10,
        font: bold,
        color: INK,
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: top - HEADER_H + 14 },
      end: { x: MARGIN + width, y: top - HEADER_H + 14 },
      thickness: 0.8,
      color: LINE,
    });
    y = top - HEADER_H;
  };

  const newPage = () => {
    page = pdf.addPage(A4);
    drawHeader();
  };
  const space = (needed: number) => {
    if (y - needed < MARGIN + 20) newPage();
  };
  const text = (s: string, opts: { x?: number; size?: number; font?: PDFFont; color?: any } = {}) => {
    page.drawText(win(s), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 9.5,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
  };
  const textRight = (s: string, opts: { size?: number; font?: PDFFont; color?: any } = {}) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 9.5;
    page.drawText(win(s), { x: MARGIN + width - f.widthOfTextAtSize(win(s), size), y, size, font: f, color: opts.color ?? INK });
  };

  drawHeader();

  // ---------- Portada / identificación ----------
  y -= 16;
  text('ESTADOS FINANCIEROS', { size: 17, font: bold });
  y -= 18;
  text(condo.name, { size: 12, font: bold, color: ROYAL });
  y -= 15;
  text(`Período: ${nombreMes} — corte al ${fecha(cutoff)}`, { size: 9.5 });
  y -= 13;
  text(`Moneda de presentación: ${currency} · Administrado por ${companyName}`, { size: 9, color: MUTED });
  y -= 13;
  text(`Elaborado por ANEXYpro el ${fecha(new Date())} a partir del Libro Diario (base de devengo).`, {
    size: 8,
    color: MUTED,
  });
  y -= 26;

  const sectionTitle = (s: string) => {
    space(40);
    text(s, { size: 11, font: bold });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.8, color: ROYAL });
    y -= 16;
  };

  const statementRow = (label: string, amount: number, opts: { bold?: boolean; indent?: number } = {}) => {
    space(16);
    const f = opts.bold ? bold : font;
    text(label, { x: MARGIN + (opts.indent ?? 0), font: f, size: 9 });
    textRight(money(amount, currency), { font: f, size: 9 });
    y -= 14;
  };

  // ---------- Estado de Situación Financiera ----------
  sectionTitle(`ESTADO DE SITUACIÓN FINANCIERA AL ${fecha(cutoff).toUpperCase()}`);

  const byType = (t: string) => balance.filter((b: BalanceRow) => b.type === t);
  // Pasivo y patrimonio llevan saldo acreedor: se presentan en positivo.
  // El criterio vive en `domain/balance-presentacion.ts` — este PDF lo
  // hacía a mano y era el único de los tres consumidores que acertaba;
  // ahora los tres usan la misma función.
  const sum = (rows: BalanceRow[]) => rows.reduce((s, r) => s + Number(r.balance), 0);
  const activos = byType('activo');
  const pasivos = byType('pasivo');
  const patrimonio = byType('patrimonio');
  const totalActivo = sum(activos);
  const totalPasivo = -sum(pasivos);
  const patrimonioAportado = -sum(patrimonio);
  const resultadoAcumulado = resultadosAcum.reduce(
    (s: number, r: ResultadosRow) => s + (r.type === 'ingreso' ? Number(r.balance) : -Number(r.balance)),
    0
  );

  statementRow('ACTIVO', totalActivo, { bold: true });
  for (const r of activos) statementRow(`${r.code}  ${r.name}`, Number(r.balance), { indent: 12 });
  y -= 4;
  statementRow('PASIVO', totalPasivo, { bold: true });
  for (const r of pasivos) statementRow(`${r.code}  ${r.name}`, -Number(r.balance), { indent: 12 });
  y -= 4;
  statementRow('PATRIMONIO', patrimonioAportado + resultadoAcumulado, { bold: true });
  for (const r of patrimonio) statementRow(`${r.code}  ${r.name}`, -Number(r.balance), { indent: 12 });
  statementRow('Resultados acumulados', resultadoAcumulado, { indent: 12 });
  y -= 4;
  space(20);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: MARGIN + width, y: y + 6 }, thickness: 0.7, color: LINE });
  statementRow('TOTAL PASIVO + PATRIMONIO', totalPasivo + patrimonioAportado + resultadoAcumulado, { bold: true });
  const cuadra = Math.abs(totalActivo - (totalPasivo + patrimonioAportado + resultadoAcumulado)) < 0.01;
  space(14);
  text(
    cuadra
      ? 'Verificación de partida doble: el activo es igual al pasivo más el patrimonio.'
      : 'ATENCIÓN: el balance no cuadra — revisar asientos del período en el Libro Diario.',
    { size: 8, color: cuadra ? MUTED : rgb(0.8, 0.15, 0.15) }
  );
  y -= 24;

  // ---------- Estado de Resultados ----------
  sectionTitle(`ESTADO DE RESULTADOS — ${nombreMes.toUpperCase()}`);
  const ingresos = resultadosMes.filter((r: ResultadosRow) => r.type === 'ingreso');
  const gastos = resultadosMes.filter((r: ResultadosRow) => r.type === 'gasto');
  const totalIngresos = ingresos.reduce((s: number, r: ResultadosRow) => s + Number(r.balance), 0);
  const totalGastos = gastos.reduce((s: number, r: ResultadosRow) => s + Number(r.balance), 0);

  statementRow('INGRESOS', totalIngresos, { bold: true });
  for (const r of ingresos) statementRow(`${r.code}  ${r.name}`, Number(r.balance), { indent: 12 });
  if (ingresos.length === 0) {
    space(14);
    text('Sin ingresos devengados en el mes.', { x: MARGIN + 12, size: 8.5, color: MUTED });
    y -= 13;
  }
  y -= 4;
  statementRow('GASTOS', totalGastos, { bold: true });
  for (const r of gastos) statementRow(`${r.code}  ${r.name}`, Number(r.balance), { indent: 12 });
  if (gastos.length === 0) {
    space(14);
    text('Sin gastos devengados en el mes.', { x: MARGIN + 12, size: 8.5, color: MUTED });
    y -= 13;
  }
  y -= 4;
  space(20);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: MARGIN + width, y: y + 6 }, thickness: 0.7, color: LINE });
  statementRow(`RESULTADO DEL PERÍODO (${nombreMes})`, totalIngresos - totalGastos, { bold: true });
  y -= 20;

  // ---------- Informe de gestión financiera y contable ----------
  sectionTitle('INFORME DE GESTIÓN FINANCIERA Y CONTABLE');
  // El cuerpo del informe mensual ya cubre resultado, cobranza,
  // presupuesto, fondo de reserva, alertas y proyección. Se omiten sus
  // 3 primeras líneas (título y período, ya presentes en la portada).
  const lineas = informe.body.split('\n').slice(3);
  for (const raw of lineas) {
    const linea = raw.trimEnd();
    if (!linea) {
      y -= 7;
      continue;
    }
    const esTituloSeccion = /^[A-ZÁÉÍÓÚÑ ]+$/.test(linea) && linea.length < 60;
    const esVineta = linea.startsWith('- ');
    const size = esTituloSeccion ? 9.5 : 9;
    const f = esTituloSeccion ? bold : font;
    const indent = esVineta ? 12 : 0;
    for (const l of wrap(win(linea), f, size, width - indent)) {
      space(14);
      text(l, { x: MARGIN + indent, size, font: f, color: esTituloSeccion ? INK : rgb(0.15, 0.17, 0.22) });
      y -= esTituloSeccion ? 14 : 12.5;
    }
    if (esTituloSeccion) y -= 2;
  }

  // ---------- Numeración y pie en todas las hojas ----------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `${condo.name} · Estados financieros ${nombreMes} · Página ${i + 1} de ${pages.length}`;
    p.drawText(win(label), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7,
      font,
      color: MUTED,
    });
  });

  const bytes = await pdf.save();
  const slug = condo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const periodo = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, '0')}`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="eeff-${slug}-${periodo}.pdf"`,
    },
  });
}
