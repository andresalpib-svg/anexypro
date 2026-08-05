import { describe, it, expect } from 'vitest';
import { parseInvoiceXml } from '@/lib/domain/invoice-xml';

// Comprobante de ejemplo con la estructura del esquema 4.4 de Hacienda.
const FACTURA = `<?xml version="1.0" encoding="utf-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50626072600310112345600100001010000000123456789012</Clave>
  <NumeroConsecutivo>00100001010000000123</NumeroConsecutivo>
  <FechaEmision>2026-07-22T10:15:00-06:00</FechaEmision>
  <Emisor>
    <Nombre>Seguros del Istmo S.A.</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>3101123456</Numero>
    </Identificacion>
  </Emisor>
  <Receptor>
    <Nombre>Condominio Residencial Altamar</Nombre>
    <Identificacion>
      <Tipo>02</Tipo>
      <Numero>3109876543</Numero>
    </Identificacion>
  </Receptor>
  <DetalleServicio>
    <LineaDetalle>
      <NumeroLinea>1</NumeroLinea>
      <Detalle>P&#243;liza de incendio &#8212; julio 2026</Detalle>
      <MontoTotal>429203.54</MontoTotal>
    </LineaDetalle>
  </DetalleServicio>
  <ResumenFactura>
    <CodigoMoneda>CRC</CodigoMoneda>
    <TotalGravado>429203.54</TotalGravado>
    <TotalExento>0.00</TotalExento>
    <TotalVentaNeta>429203.54</TotalVentaNeta>
    <TotalImpuesto>55796.46</TotalImpuesto>
    <TotalComprobante>485000.00</TotalComprobante>
  </ResumenFactura>
</FacturaElectronica>`;

describe('lectura del XML de factura electrónica', () => {
  const r = parseInvoiceXml(FACTURA)!;

  it('reconoce el comprobante', () => {
    expect(r).not.toBeNull();
  });

  it('extrae la clave de 50 dígitos', () => {
    expect(r.clave).toHaveLength(50);
  });

  it('extrae el consecutivo', () => {
    expect(r.consecutive).toBe('00100001010000000123');
  });

  it('extrae la fecha de emisión', () => {
    expect(r.issueDate?.toISOString().slice(0, 10)).toBe('2026-07-22');
  });

  it('extrae el emisor con su cédula jurídica', () => {
    expect(r.emitterName).toBe('Seguros del Istmo S.A.');
    expect(r.emitterTaxId).toBe('3101123456');
  });

  it('NO confunde el emisor con el receptor', () => {
    expect(r.receiverName).toBe('Condominio Residencial Altamar');
    expect(r.receiverTaxId).toBe('3109876543');
    expect(r.emitterTaxId).not.toBe(r.receiverTaxId);
  });

  // Es lo que permite registrar el gasto sin digitar montos.
  it('extrae los montos exactos', () => {
    expect(r.subtotal).toBe(429203.54);
    expect(r.taxTotal).toBe(55796.46);
    expect(r.total).toBe(485000);
  });

  it('los montos cuadran entre sí', () => {
    expect(r.subtotal! + r.taxTotal!).toBeCloseTo(r.total!, 2);
  });

  it('extrae la moneda', () => {
    expect(r.currency).toBe('CRC');
  });

  it('decodifica las entidades del detalle', () => {
    expect(r.summary).toContain('Póliza de incendio');
    expect(r.summary).not.toContain('&#243;');
  });

  it('cuenta las líneas de detalle', () => {
    expect(r.lineCount).toBe(1);
  });

  it('descarta un archivo que no es un comprobante', () => {
    expect(parseInvoiceXml('<html><body>hola</body></html>')).toBeNull();
  });

  it('tolera un comprobante incompleto sin reventar', () => {
    const parcial = parseInvoiceXml('<FacturaElectronica><Clave>123</Clave></FacturaElectronica>');
    expect(parcial).not.toBeNull();
    expect(parcial!.total).toBeNull();
  });

  it('deriva el subtotal si solo viene el total y el impuesto', () => {
    const xml = `<FacturaElectronica><Clave>1</Clave><ResumenFactura>
      <TotalImpuesto>13000.00</TotalImpuesto><TotalComprobante>113000.00</TotalComprobante>
    </ResumenFactura></FacturaElectronica>`;
    const p = parseInvoiceXml(xml)!;
    expect(p.subtotal).toBe(100000);
  });
});
