import { describe, it, expect } from 'vitest';
import { brandStyle, parseHex, contrastaConBlanco, contrasteConBlanco, MARCA_POR_DEFECTO } from '@/lib/branding';

describe('parseHex()', () => {
  it('acepta con y sin almohadilla', () => {
    expect(parseHex('#3F6DF6')).toEqual({ r: 63, g: 109, b: 246 });
    expect(parseHex('3f6df6')).toEqual({ r: 63, g: 109, b: 246 });
  });

  it('devuelve null con basura, en vez de un color inventado', () => {
    expect(parseHex('azul')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
  });
});

describe('brandStyle()', () => {
  it('sin marca propia no devuelve nada: el panel usa la paleta de la hoja de estilos', () => {
    expect(brandStyle({})).toEqual({});
    expect(brandStyle({ brandPrimary: null, brandDeep: null })).toEqual({});
  });

  it('deriva los cuatro tonos de un solo color', () => {
    const s = brandStyle({ brandPrimary: '#3F6DF6' });
    expect(s['--royal-rgb']).toBe('63 109 246');
    expect(s['--royal-dark-rgb']).toBeDefined();
    expect(s['--royal-soft-rgb']).toBeDefined();
    expect(s['--royal-line-rgb']).toBeDefined();
  });

  it('el tono oscuro es más oscuro y el suave más claro que el base', () => {
    const s = brandStyle({ brandPrimary: '#3F6DF6' });
    const suma = (v: string) => v.split(' ').reduce((n, x) => n + Number(x), 0);
    expect(suma(s['--royal-dark-rgb']!)).toBeLessThan(suma(s['--royal-rgb']!));
    expect(suma(s['--royal-soft-rgb']!)).toBeGreaterThan(suma(s['--royal-rgb']!));
  });

  it('un color inválido se ignora y no rompe el panel', () => {
    expect(brandStyle({ brandPrimary: 'no-es-un-color' })).toEqual({});
  });

  it('el color oscuro solo toca las variables de la barra lateral', () => {
    const s = brandStyle({ brandDeep: '#123456' });
    expect(s['--deep-rgb']).toBe('18 52 86');
    expect(s['--royal-rgb']).toBeUndefined();
  });

  it('los valores salen en canales sueltos, que es lo que espera Tailwind', () => {
    const s = brandStyle({ brandPrimary: '#000000' });
    expect(s['--royal-rgb']).toBe('0 0 0');
    expect(s['--royal-rgb']).not.toContain('#');
  });
});

describe('contrastaConBlanco()', () => {
  it('acepta el azul de la marca y los tonos oscuros', () => {
    expect(contrastaConBlanco(MARCA_POR_DEFECTO.primary)).toBe(true);
    expect(contrastaConBlanco('#0F172A')).toBe(true);
  });

  it('rechaza un amarillo, donde el texto blanco no se leería', () => {
    expect(contrastaConBlanco('#FFD400')).toBe(false);
    expect(contrastaConBlanco('#FFFFFF')).toBe(false);
  });

  it('el umbral es 3:1 — el propio azul de la marca está en 3,6:1', () => {
    const r = contrasteConBlanco(MARCA_POR_DEFECTO.primary);
    expect(r).toBeGreaterThan(3);
    expect(r).toBeLessThan(4.5);
  });
});
