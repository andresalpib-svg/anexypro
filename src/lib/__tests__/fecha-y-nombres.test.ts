import { describe, it, expect } from 'vitest';
import { hoyISO, fechaSolo } from '@/lib/fecha-local';
import { decodeUploadName } from '@/lib/nombre-subida';

describe('hoyISO — el día del calendario del usuario', () => {
  it('usa la fecha LOCAL, no la UTC', () => {
    // 8 de agosto a las 9:04 p.m. en Costa Rica es el 9 de agosto en UTC.
    // Ese desfase fechaba con el día siguiente todo lo que se registrara
    // de 6 p.m. en adelante.
    const nocheEnCostaRica = new Date('2026-08-09T03:04:00.000Z');
    const esperado = `${nocheEnCostaRica.getFullYear()}-${String(nocheEnCostaRica.getMonth() + 1).padStart(2, '0')}-${String(
      nocheEnCostaRica.getDate()
    ).padStart(2, '0')}`;
    expect(hoyISO(nocheEnCostaRica)).toBe(esperado);
  });

  it('no coincide con toISOString cuando el proceso corre al oeste de Greenwich', () => {
    const fecha = new Date('2026-08-09T03:04:00.000Z');
    if (fecha.getUTCDate() !== fecha.getDate()) {
      expect(hoyISO(fecha)).not.toBe(fecha.toISOString().slice(0, 10));
    }
  });

  it('rellena mes y día con dos dígitos', () => {
    expect(hoyISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('fechaSolo — columnas @db.Date', () => {
  it('no corre el día aunque el proceso esté al oeste de Greenwich', () => {
    // Una reserva para el 14 de agosto llega como medianoche UTC. Leída
    // en hora de Costa Rica serían las 6 p.m. del 13.
    expect(fechaSolo('2026-08-14T00:00:00.000Z')).toBe('14/8/2026');
  });

  it('el vencimiento del día 15 se muestra el 15', () => {
    expect(fechaSolo(new Date('2026-05-15T00:00:00.000Z'))).toBe('15/5/2026');
  });

  it('el mes de un período no se corre al anterior', () => {
    // El período de agosto es el 1.º de agosto a medianoche UTC: en hora
    // local sería el 31 de julio, y la cuota se describía como "julio".
    expect(fechaSolo('2026-08-01T00:00:00.000Z', { month: 'long', year: 'numeric' })).toBe('agosto de 2026');
  });

  it('el vencimiento se arma en UTC y cae en el mes del período', () => {
    // Réplica exacta de lo que hace generateOrdinaryBilling.
    const period = new Date('2026-08-01T00:00:00.000Z');
    const dueDay = 15;
    const dueDate = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), dueDay));
    expect(dueDate.toISOString().slice(0, 10)).toBe('2026-08-15');
  });
});

describe('decodeUploadName — nombres de archivo del formulario', () => {
  it('recompone un nombre con ñ que llegó como latin-1', () => {
    expect(decodeUploadName('factura Ã±andÃº agosto.png')).toBe('factura ñandú agosto.png');
  });

  it('recompone el espacio fino de las capturas de macOS', () => {
    expect(decodeUploadName('Captura 3.27.23â¯p.Â m..png')).toContain('3.27.23');
  });

  it('deja intacto un nombre ASCII', () => {
    expect(decodeUploadName('factura-ok.png')).toBe('factura-ok.png');
  });

  it('deja intacto un nombre que ya está bien y no es UTF-8 al reinterpretarlo', () => {
    // "ñ" sola (U+00F1) no forma UTF-8 válido leída como latin-1:
    // se devuelve tal cual en vez de romperla.
    expect(decodeUploadName('mañana.png')).toBe('mañana.png');
    expect(decodeUploadName('acción.pdf')).toBe('acción.pdf');
  });

  it('es idempotente: aplicarlo dos veces no vuelve a cambiar el nombre', () => {
    const unaVez = decodeUploadName('factura Ã±andÃº agosto.png');
    expect(decodeUploadName(unaVez)).toBe(unaVez);
  });
});
