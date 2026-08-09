import { describe, it, expect } from 'vitest';
import { fechaISO, horaHHMM, urlExterna, fechaISOOpcional, telefono, telefonoOpcional } from '../validations/comunes';
import { reservationSchema } from '../validations/reservation';
import { mensajeDeError } from '../errores';

describe('fechaISO', () => {
  it('acepta una fecha real', () => {
    expect(fechaISO.safeParse('2026-08-05').success).toBe(true);
  });

  it('rechaza el formato equivocado', () => {
    expect(fechaISO.safeParse('05/08/2026').success).toBe(false);
    expect(fechaISO.safeParse('hola').success).toBe(false);
    expect(fechaISO.safeParse('').success).toBe(false);
  });

  it('rechaza una fecha que no existe aunque el formato sea válido', () => {
    // `new Date('2026-02-31')` no falla: se corre al 3 de marzo. Ese
    // corrimiento silencioso es justo lo que hay que atajar.
    expect(fechaISO.safeParse('2026-02-31').success).toBe(false);
    expect(fechaISO.safeParse('2026-13-01').success).toBe(false);
  });

  it('acepta el 29 de febrero en año bisiesto y lo rechaza si no lo es', () => {
    expect(fechaISO.safeParse('2028-02-29').success).toBe(true);
    expect(fechaISO.safeParse('2026-02-29').success).toBe(false);
  });

  it('la variante opcional admite el campo vacío', () => {
    expect(fechaISOOpcional.safeParse('').success).toBe(true);
    expect(fechaISOOpcional.safeParse(undefined).success).toBe(true);
    expect(fechaISOOpcional.safeParse('no-es-fecha').success).toBe(false);
  });
});

describe('horaHHMM', () => {
  it('acepta horas válidas de 24 h', () => {
    for (const h of ['00:00', '09:30', '23:59']) {
      expect(horaHHMM.safeParse(h).success).toBe(true);
    }
  });

  it('rechaza horas imposibles', () => {
    for (const h of ['24:00', '12:60', '9:30', '', 'tarde']) {
      expect(horaHHMM.safeParse(h).success).toBe(false);
    }
  });
});

describe('urlExterna', () => {
  it('acepta http y https', () => {
    expect(urlExterna.safeParse('https://ejemplo.com/a.pdf').success).toBe(true);
    expect(urlExterna.safeParse('http://ejemplo.com').success).toBe(true);
  });

  it('rechaza javascript: y data:, que ejecutan código al renderizarse en un href', () => {
    expect(urlExterna.safeParse('javascript:alert(1)').success).toBe(false);
    expect(urlExterna.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
  });
});

describe('reservationSchema', () => {
  const base = {
    condominiumId: '11111111-1111-4111-8111-111111111111',
    amenityId: '22222222-2222-4222-8222-222222222222',
    propertyId: '33333333-3333-4333-8333-333333333333',
    resDate: '2026-08-20',
  };

  it('acepta un rango de horas normal', () => {
    expect(reservationSchema.safeParse({ ...base, startsAt: '14:00', endsAt: '16:00' }).success).toBe(true);
  });

  it('rechaza el rango invertido', () => {
    // Con 23:00–01:00 la comparación de texto no detecta solapamiento,
    // así que se podían crear dos reservas sobre la misma franja.
    expect(reservationSchema.safeParse({ ...base, startsAt: '23:00', endsAt: '01:00' }).success).toBe(false);
  });

  it('rechaza que la hora de fin sea igual a la de inicio', () => {
    expect(reservationSchema.safeParse({ ...base, startsAt: '10:00', endsAt: '10:00' }).success).toBe(false);
  });
});

describe('mensajeDeError', () => {
  it('deja pasar los mensajes de negocio', () => {
    expect(mensajeDeError(new Error('El gasto supera el saldo disponible.'), 'generico')).toBe(
      'El gasto supera el saldo disponible.'
    );
  });

  it('oculta los errores de Prisma', () => {
    const e: any = new Error('Invalid `prisma.charge.create()` invocation');
    e.code = 'P2002';
    expect(mensajeDeError(e, 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });

  it('oculta los fallos de infraestructura aunque no traigan código', () => {
    expect(mensajeDeError(new Error('connect ECONNREFUSED 127.0.0.1:5432'), 'generico')).toBe('generico');
    expect(mensajeDeError(new Error('relation "charges" does not exist'), 'generico')).toBe('generico');
  });

  it('oculta las trazas largas o multilínea', () => {
    expect(mensajeDeError(new Error('falló\n  en algún sitio'), 'generico')).toBe('generico');
    expect(mensajeDeError(new Error('x'.repeat(300)), 'generico')).toBe('generico');
  });

  it('cae al genérico si no hay mensaje', () => {
    expect(mensajeDeError(null, 'generico')).toBe('generico');
    expect(mensajeDeError(new Error(''), 'generico')).toBe('generico');
  });
});

describe('telefono', () => {
  it('acepta los formatos con que la gente escribe un número de Costa Rica', () => {
    for (const v of ['88881010', '8888-1010', '8888 1010', '+506 8888 1010', '(506) 8888-1010']) {
      expect(telefono.safeParse(v).success).toBe(true);
    }
  });

  it('rechaza el número de nueve dígitos que quedó en los datos demo', () => {
    // "87013-1071" no se puede marcar: sobra un dígito.
    expect(telefono.safeParse('87013-1071').success).toBe(false);
  });

  it('rechaza lo que claramente no es un teléfono', () => {
    for (const v of ['', '123', 'no tengo', '8888-101']) {
      expect(telefono.safeParse(v).success).toBe(false);
    }
  });

  it('el opcional deja pasar el campo vacío pero no uno inválido', () => {
    expect(telefonoOpcional.safeParse('').success).toBe(true);
    expect(telefonoOpcional.safeParse(undefined).success).toBe(true);
    expect(telefonoOpcional.safeParse('123').success).toBe(false);
    expect(telefonoOpcional.safeParse('8888-1010').success).toBe(true);
  });
});
