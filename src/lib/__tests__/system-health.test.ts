import { describe, it, expect } from 'vitest';
import { dominioDelRemitente } from '@/lib/services/system-health';

/**
 * De esta función depende que el Estado del Sistema sepa si el dominio
 * del remitente está verificado en Resend. Si extrae mal el dominio, la
 * pantalla diría "todo bien" con el correo roto — que es exactamente la
 * avería silenciosa que vino a evitar.
 */
describe('dominioDelRemitente()', () => {
  it('lo saca del formato con nombre, que es el que usa el sistema', () => {
    expect(dominioDelRemitente('ANEXYpro <notificaciones@anexypro.com>')).toBe('anexypro.com');
  });

  it('acepta también el correo pelado', () => {
    expect(dominioDelRemitente('api@anexypro.com')).toBe('anexypro.com');
  });

  it('normaliza a minúsculas — Resend devuelve los dominios así', () => {
    expect(dominioDelRemitente('ANEXYpro <Avisos@AnexyPro.COM>')).toBe('anexypro.com');
  });

  it('distingue subdominios: enviar desde send.anexypro.com NO es anexypro.com', () => {
    expect(dominioDelRemitente('a <b@send.anexypro.com>')).toBe('send.anexypro.com');
  });

  it('devuelve null cuando no hay un correo válido', () => {
    expect(dominioDelRemitente('basura')).toBeNull();
    expect(dominioDelRemitente('')).toBeNull();
    expect(dominioDelRemitente(null)).toBeNull();
    expect(dominioDelRemitente(undefined)).toBeNull();
  });
});
