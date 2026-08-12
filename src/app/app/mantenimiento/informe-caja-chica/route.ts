import { NextResponse } from 'next/server';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { canAccessCondo, getCondominium } from '@/lib/services/condominiums';
import { getPettyCash } from '@/lib/services/petty-cash';
import { isSafePng, isSafeJpeg, embedSafeImage } from '@/lib/image-safety';
import { actorFromSession, readObject } from '@/lib/services/storage';
import { objectIdFromRef } from '@/lib/services/file-refs';
import type { Actor } from '@/lib/storage/permissions';

export const dynamic = 'force-dynamic';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.45, 0.48, 0.55);
const ROYAL = rgb(0.16, 0.35, 0.92);
const LINE = rgb(0.85, 0.87, 0.9);

/**
 * pdf-lib solo escribe WinAnsi con las fuentes estándar. El símbolo ₡
 * no existe en esa tabla y reventaría la generación, así que los
 * montos se rotulan con el código de moneda.
 */
function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

/** Recorta el texto para que quepa en el ancho dado. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Lee la factura adjunta desde el repositorio privado.
 *
 * Antes leía de `public/uploads` con la ruta guardada en la columna.
 * Ahora la columna guarda `/api/archivo/<id>` y los bytes salen del
 * proveedor de almacenamiento, pasando por la verificación de permisos
 * de `readObject` — el informe no puede incrustar una factura que quien
 * lo descarga no tendría derecho a ver.
 *
 * Devuelve null si el adjunto es una referencia antigua sin migrar o si
 * el actor no puede leerlo: el informe se genera igual, señalando que
 * esa factura no se pudo incrustar.
 */
async function readInvoice(
  actor: Actor,
  url: string
): Promise<{ data: Buffer; ext: string } | null> {
  const objectId = objectIdFromRef(url);
  if (!objectId) return null;
  try {
    const obj = await readObject(actor, objectId);
    // La referencia `/api/archivo/<id>` no lleva extensión: el tipo se
    // toma del nombre con que se guardó el archivo.
    return { data: obj.data, ext: path.extname(obj.name).toLowerCase() };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff'].includes(session.user.role)) {
    return new NextResponse('No autorizado', { status: 401 });
  }
  // Los route handlers no pasan por el layout: el área se comprueba
  // aquí o un supervisor con Mantenimientos apagado descarga el
  // informe con sus facturas escribiendo la dirección.
  if (!can(session, 'mantenimientos')) {
    return new NextResponse('Sin acceso a Mantenimientos', { status: 403 });
  }

  const condoId = new URL(req.url).searchParams.get('condoId');
  if (!condoId) return new NextResponse('Falta el condominio', { status: 400 });
  if (!(await canAccessCondo(session, condoId))) {
    return new NextResponse('Sin acceso a este condominio', { status: 403 });
  }

  const actor = await actorFromSession(session);
  const [condo, cash] = await Promise.all([
    getCondominium(session.user.companyId, condoId),
    getPettyCash(session.user.companyId, condoId),
  ]);
  if (!condo) return new NextResponse('Condominio no encontrado', { status: 404 });

  const currency = condo.currency;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage(A4);
  let y = page.getHeight() - MARGIN;
  const width = page.getWidth() - MARGIN * 2;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = page.getHeight() - MARGIN;
  };
  const space = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };
  const text = (s: string, opts: { x?: number; size?: number; font?: PDFFont; color?: any } = {}) => {
    page.drawText(s, {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
  };

  // ---------- Encabezado ----------
  text('INFORME DE CAJA CHICA', { size: 18, font: bold });
  y -= 20;
  text(condo.name, { size: 12, font: bold, color: ROYAL });
  y -= 14;
  text(`Generado el ${fecha(new Date())} por ${session.user.name ?? 'Usuario'}`, { size: 9, color: MUTED });
  y -= 24;

  // ---------- Resumen ----------
  page.drawRectangle({ x: MARGIN, y: y - 54, width, height: 54, color: rgb(0.96, 0.97, 0.99) });
  const colW = width / 3;
  const resumen: [string, string][] = [
    ['Monto asignado', money(cash.summary.assigned, currency)],
    ['Total gastado', money(cash.summary.spent, currency)],
    ['Saldo disponible', money(cash.summary.balance, currency)],
  ];
  resumen.forEach(([label, value], i) => {
    const x = MARGIN + 12 + colW * i;
    page.drawText(label.toUpperCase(), { x, y: y - 20, size: 7.5, font: bold, color: MUTED });
    page.drawText(value, { x, y: y - 40, size: 13, font: bold, color: i === 2 ? ROYAL : INK });
  });
  y -= 78;

  // ---------- Detalle de gastos ----------
  text('DESGLOSE DE GASTOS', { size: 10, font: bold });
  y -= 16;

  const cols = { fecha: MARGIN, detalle: MARGIN + 70, factura: MARGIN + 300, monto: MARGIN + width };
  const header = () => {
    page.drawText('FECHA', { x: cols.fecha, y, size: 7.5, font: bold, color: MUTED });
    page.drawText('DETALLE', { x: cols.detalle, y, size: 7.5, font: bold, color: MUTED });
    page.drawText('FACTURA', { x: cols.factura, y, size: 7.5, font: bold, color: MUTED });
    const w = bold.widthOfTextAtSize('MONTO', 7.5);
    page.drawText('MONTO', { x: cols.monto - w, y, size: 7.5, font: bold, color: MUTED });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.7, color: LINE });
    y -= 13;
  };
  header();

  if (cash.expenses.length === 0) {
    text('Sin gastos registrados en el período.', { size: 9, color: MUTED });
    y -= 16;
  }

  // Las facturas se numeran para poder referenciarlas en los anexos.
  const anexos: { n: number; detail: string; url: string; name: string }[] = [];

  for (const e of cash.expenses) {
    space(20);
    if (y === page.getHeight() - MARGIN) header();

    const n = e.invoiceUrl ? anexos.length + 1 : 0;
    if (e.invoiceUrl) anexos.push({ n, detail: e.detail, url: e.invoiceUrl, name: e.invoiceName ?? 'Factura' });

    page.drawText(fecha(e.spentOn), { x: cols.fecha, y, size: 9 });
    page.drawText(fit(e.detail, font, 9, 220), { x: cols.detalle, y, size: 9 });
    page.drawText(n ? `Anexo ${n}` : 'Sin factura', {
      x: cols.factura,
      y,
      size: 9,
      color: n ? ROYAL : MUTED,
    });
    const amount = money(Number(e.amount), currency);
    page.drawText(amount, { x: cols.monto - bold.widthOfTextAtSize(amount, 9), y, size: 9, font: bold });
    y -= 15;
  }

  // Total
  space(28);
  page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: MARGIN + width, y: y + 4 }, thickness: 0.7, color: LINE });
  y -= 10;
  page.drawText('TOTAL GASTADO', { x: cols.detalle, y, size: 9, font: bold });
  const total = money(cash.summary.spent, currency);
  page.drawText(total, { x: cols.monto - bold.widthOfTextAtSize(total, 10), y, size: 10, font: bold });
  y -= 26;

  // ---------- Asignaciones ----------
  space(60);
  text('ASIGNACIONES RECIBIDAS', { size: 10, font: bold });
  y -= 16;
  if (cash.allocations.length === 0) {
    text('Sin asignaciones registradas.', { size: 9, color: MUTED });
    y -= 15;
  }
  for (const a of cash.allocations) {
    space(18);
    page.drawText(fecha(a.allocatedOn), { x: cols.fecha, y, size: 9 });
    page.drawText(fit(a.note ?? 'Asignación de caja chica', font, 9, 220), { x: cols.detalle, y, size: 9 });
    const amount = money(Number(a.amount), currency);
    page.drawText(amount, { x: cols.monto - bold.widthOfTextAtSize(amount, 9), y, size: 9, font: bold });
    y -= 15;
  }

  // ---------- Anexos: las facturas ----------
  for (const anexo of anexos) {
    const invoice = await readInvoice(actor, anexo.url);
    if (!invoice) continue;
    const { data: bytes, ext } = invoice;

    if (ext === '.pdf') {
      // Las facturas en PDF se incorporan con todas sus páginas.
      try {
        const src = await PDFDocument.load(bytes);
        const copied = await pdf.copyPages(src, src.getPageIndices());
        copied.forEach((p) => pdf.addPage(p));
      } catch {
        // Un PDF ilegible no debe tumbar el informe completo.
      }
      continue;
    }

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      // El decodificador de imágenes de pdf-lib se cuelga con archivos
      // corruptos (bucle infinito, no excepción), así que se valida
      // antes con zlib. Ver src/lib/image-safety.ts.
      const safe = ext === '.png' ? isSafePng(bytes) : isSafeJpeg(bytes);
      if (!safe) {
        const p = pdf.addPage(A4);
        p.drawText(`ANEXO ${anexo.n} — ${fit(anexo.detail, bold, 11, p.getWidth() - MARGIN * 2)}`, {
          x: MARGIN,
          y: p.getHeight() - MARGIN,
          size: 11,
          font: bold,
        });
        p.drawText('La imagen de la factura no se pudo leer. Consultala en el sistema.', {
          x: MARGIN,
          y: p.getHeight() - MARGIN - 24,
          size: 9,
          font,
          color: MUTED,
        });
        continue;
      }
      try {
        const img = await embedSafeImage(pdf, ext, bytes);
        if (!img) continue; // ya se validó arriba, pero nunca se llama a embedPng/embedJpg sin pasar por acá
        const p = pdf.addPage(A4);
        const availW = p.getWidth() - MARGIN * 2;
        const availH = p.getHeight() - MARGIN * 2 - 40;
        const scale = Math.min(availW / img.width, availH / img.height, 1);
        p.drawText(`ANEXO ${anexo.n} — ${fit(anexo.detail, bold, 11, availW)}`, {
          x: MARGIN,
          y: p.getHeight() - MARGIN,
          size: 11,
          font: bold,
        });
        p.drawImage(img, {
          x: MARGIN + (availW - img.width * scale) / 2,
          y: MARGIN,
          width: img.width * scale,
          height: img.height * scale,
        });
      } catch {
        // Imagen corrupta: se omite el anexo, no el informe.
      }
    }
  }

  const bytes = await pdf.save();
  const slug = condo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="caja-chica-${slug}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
