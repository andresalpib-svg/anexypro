import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { buildViolationNoticePdf, winAnsi, money } from '@/lib/pdf/violation-notice';

/** PNG mínimo y válido, generado con pdf-lib para no depender de archivos. */
async function pngDePrueba(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([60, 40]);
  page.drawRectangle({ x: 0, y: 0, width: 60, height: 40, color: rgb(0.2, 0.5, 0.9) });
  // pdf-lib no exporta PNG; se usa un PNG 1x1 real codificado.
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
}

const BASE = {
  kind: 'advertencia' as const,
  sequence: 1,
  caseNumber: 'INC-2026-0001',
  condominiumName: 'Residencial Altamar',
  propertyCode: 'CASA-13',
  ownerName: 'Ana Rojas Peña',
  violationName: 'Ruido',
  regulationArticle: 'Artículo 12, inciso b',
  issuedAt: new Date('2026-08-02T15:30:00Z'),
  bodyText: 'Estimada Ana:\n\nSe registró un incumplimiento por ruido.\n\nAtentamente,',
  observation: 'Música a alto volumen pasadas las 11 p. m.',
  currency: 'CRC',
  responseDays: 8,
  supervisorName: 'Carlos Méndez',
  adminName: 'Administradora Delta',
  branding: {
    primaryColor: '#3B6EF5',
    headerText: 'Cédula jurídica 3-101-000000 · San José, Costa Rica',
    footerText: 'Este documento fue emitido electrónicamente por ANEXYpro.',
    signerName: 'María Fernández',
    signerTitle: 'Administradora',
  },
  images: [],
};

describe('winAnsi()', () => {
  it('reemplaza el símbolo de colón, que pdf-lib no sabe dibujar', () => {
    expect(winAnsi('₡25.000')).toBe('CRC 25.000');
  });

  it('conserva acentos y eñe', () => {
    expect(winAnsi('Ana Rojas Peña — construcción')).toBe('Ana Rojas Peña - construcción');
  });

  it('descarta lo que no existe en latin-1 en vez de dejar que reviente', () => {
    expect(winAnsi('Ruido 🔊 nocturno')).toBe('Ruido  nocturno');
  });
});

describe('money()', () => {
  it('rotula la moneda con su código y el formato de Costa Rica', () => {
    expect(money(25000, 'CRC')).toBe('CRC 25.000,00');
    expect(money(1234567.5, 'CRC')).toBe('CRC 1.234.567,50');
    expect(money(0, 'USD')).toBe('USD 0,00');
  });

  it('no produce caracteres que el PDF tendría que descartar', () => {
    const m = money(25000, 'CRC');
    expect(winAnsi(m)).toBe(m);
  });
});

describe('buildViolationNoticePdf()', () => {
  it('genera un PDF válido para una advertencia', async () => {
    const bytes = await buildViolationNoticePdf(BASE);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('genera la resolución de multa con su monto', async () => {
    const bytes = await buildViolationNoticePdf({
      ...BASE,
      kind: 'multa',
      fineAmount: 50000,
      bodyText: 'Se resuelve aplicar una multa.',
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('incrusta las fotografías de evidencia', async () => {
    const png = await pngDePrueba();
    const bytes = await buildViolationNoticePdf({
      ...BASE,
      images: [
        { data: png, ext: '.png' },
        { data: png, ext: '.png' },
        { data: png, ext: '.png' },
      ],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('descarta una imagen corrupta sin colgarse ni perder el documento', async () => {
    // PNG con firma válida y contenido roto: es el caso que hacía que
    // pdf-lib girara al 180 % de CPU indefinidamente.
    const corrupto = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(40, 0x00),
    ]);
    const bytes = await buildViolationNoticePdf({ ...BASE, images: [{ data: corrupto, ext: '.png' }] });
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('no revienta con un nombre que trae caracteres fuera de WinAnsi', async () => {
    const bytes = await buildViolationNoticePdf({ ...BASE, ownerName: 'Ana Rojas 🏠', observation: '₡ 50.000 → pago' });
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('un texto largo se reparte en varias páginas', async () => {
    const largo = Array.from({ length: 160 }, (_, i) => `Párrafo ${i + 1} del detalle del incumplimiento registrado.`).join('\n');
    const doc = await PDFDocument.load(await buildViolationNoticePdf({ ...BASE, bodyText: largo }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
