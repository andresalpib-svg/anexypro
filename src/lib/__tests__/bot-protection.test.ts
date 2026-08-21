import { describe, it, expect } from 'vitest';
import { pareceBot } from '../bot-protection';

describe('pareceBot', () => {
  it('un envío humano normal (con hora reciente, sin campo trampa) pasa', () => {
    const renderedAt = String(Date.now() - 3000); // 3s atrás
    expect(pareceBot({ honeypot: '', renderedAt })).toBe(false);
  });

  it('el campo trampa lleno delata un bot', () => {
    const renderedAt = String(Date.now() - 3000);
    expect(pareceBot({ honeypot: 'https://spam.example', renderedAt })).toBe(true);
  });

  it('un envío demasiado rápido (menos de 1.2s) es sospechoso', () => {
    const renderedAt = String(Date.now() - 200);
    expect(pareceBot({ honeypot: '', renderedAt })).toBe(true);
  });

  it('sin hora de renderizado es sospechoso (un bot podría omitir el campo)', () => {
    expect(pareceBot({ honeypot: '', renderedAt: null })).toBe(true);
    expect(pareceBot({ honeypot: '', renderedAt: '' })).toBe(true);
  });

  it('una hora de renderizado que no es un número es sospechosa', () => {
    expect(pareceBot({ honeypot: '', renderedAt: 'no-es-un-numero' })).toBe(true);
  });

  it('una página cacheada de hace más de una hora es sospechosa', () => {
    const renderedAt = String(Date.now() - 2 * 60 * 60 * 1000);
    expect(pareceBot({ honeypot: '', renderedAt })).toBe(true);
  });

  it('justo en el borde (1.2s) ya no cuenta como demasiado rápido', () => {
    const renderedAt = String(Date.now() - 1201);
    expect(pareceBot({ honeypot: '', renderedAt })).toBe(false);
  });
});
