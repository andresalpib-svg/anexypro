import { describe, it, expect } from 'vitest';
import { soloDigitos, correoNormalizado, camposQueFaltan } from '@/lib/services/person-identity';

/**
 * La deduplicación de personas descansa en estas tres funciones: si
 * fallan, o se crea una ficha por condominio (y con ella un segundo
 * intento de cuenta con el mismo correo), o se funden dos personas
 * distintas en una. Las dos equivocaciones son caras.
 */

describe('soloDigitos()', () => {
  it('reconoce la misma cédula escrita de cuatro maneras', () => {
    const esperado = '102340567';
    expect(soloDigitos('1-0234-0567')).toBe(esperado);
    expect(soloDigitos('102340567')).toBe(esperado);
    expect(soloDigitos('1 0234 0567')).toBe(esperado);
    expect(soloDigitos(' 1.0234.0567 ')).toBe(esperado);
  });

  it('devuelve vacío cuando no hay con qué identificar', () => {
    expect(soloDigitos(null)).toBe('');
    expect(soloDigitos(undefined)).toBe('');
    expect(soloDigitos('   ')).toBe('');
    // Un DIMEX o pasaporte con letras conserva solo sus dígitos; si no
    // llega a 5 el llamador no lo usa como criterio.
    expect(soloDigitos('A-12')).toBe('12');
  });

  it('no confunde dos cédulas distintas', () => {
    expect(soloDigitos('1-0234-0567')).not.toBe(soloDigitos('1-0234-0568'));
  });
});

describe('correoNormalizado()', () => {
  it('ignora mayúsculas y espacios sobrantes', () => {
    expect(correoNormalizado('  Ana.Perez@Correo.COM ')).toBe('ana.perez@correo.com');
  });

  it('devuelve vacío si no hay correo', () => {
    expect(correoNormalizado(null)).toBe('');
    expect(correoNormalizado(undefined)).toBe('');
  });
});

describe('camposQueFaltan()', () => {
  const actual = { idNumber: '1-0234-0567', email: 'ana@correo.com', phone: null };

  it('completa solo lo que la ficha no tenía', () => {
    expect(camposQueFaltan(actual, { phone: '8888-8888' })).toEqual({ phone: '8888-8888' });
  });

  it('NUNCA pisa un dato ya registrado', () => {
    // Corregir el correo de alguien es una decisión de quien
    // administra, no un efecto secundario de asignarle otra unidad.
    expect(camposQueFaltan(actual, { email: 'otro@correo.com', idNumber: '9-9999-9999' })).toEqual({});
  });

  it('no inventa campos cuando lo entrante viene vacío', () => {
    expect(camposQueFaltan(actual, { phone: null })).toEqual({});
    expect(camposQueFaltan({ idNumber: null, email: null, phone: null }, {})).toEqual({});
  });

  it('completa varios campos a la vez', () => {
    expect(
      camposQueFaltan({ idNumber: null, email: null, phone: null }, { idNumber: '1-1', email: 'a@b.c', phone: '22' })
    ).toEqual({ idNumber: '1-1', email: 'a@b.c', phone: '22' });
  });
});
