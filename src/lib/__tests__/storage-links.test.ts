import { describe, it, expect, beforeAll } from 'vitest';
import { issueLink, verifyLink, linkPath } from '@/lib/services/storage-links';

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'secreto-de-prueba-para-firmar-enlaces';
});

describe('enlaces temporales de descarga', () => {
  it('emite y verifica un enlace válido', () => {
    const token = issueLink('objeto-1', 'usuario-1');
    const r = verifyLink(token);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.o).toBe('objeto-1');
      expect(r.payload.u).toBe('usuario-1');
    }
  });

  it('la ruta apunta a ANEXYpro, nunca al proveedor', () => {
    const p = linkPath(issueLink('objeto-1', 'usuario-1'));
    expect(p.startsWith('/api/documentos/')).toBe(true);
    expect(p).not.toMatch(/googleapis|drive\.google|amazonaws|r2\.cloudflare/);
  });

  // Es la protección central: un token manipulado no debe servir.
  it('rechaza un enlace alterado', () => {
    const token = issueLink('objeto-1', 'usuario-1');
    const [body, sig] = token.split('.');
    const otro = issueLink('objeto-SECRETO', 'usuario-1').split('.')[0];
    const falso = `${otro}.${sig}`;
    const r = verifyLink(falso);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/alterado/);
  });

  it('rechaza una firma inventada', () => {
    const [body] = issueLink('objeto-1', 'usuario-1').split('.');
    const r = verifyLink(`${body}.firmafalsa`);
    expect(r.ok).toBe(false);
  });

  it('rechaza un enlace vencido', () => {
    const token = issueLink('objeto-1', 'usuario-1', { ttlSeconds: -10 });
    const r = verifyLink(token);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/venció/);
  });

  it('rechaza basura', () => {
    expect(verifyLink('').ok).toBe(false);
    expect(verifyLink('sin-punto').ok).toBe(false);
    expect(verifyLink('a.b.c').ok).toBe(false);
  });

  it('el enlace queda ligado a un usuario concreto', () => {
    const r = verifyLink(issueLink('objeto-1', 'usuario-laura'));
    expect(r.ok).toBe(true);
    // La ruta compara este campo contra la sesión: por eso el enlace no
    // se puede pasar a otra persona.
    if (r.ok) expect(r.payload.u).toBe('usuario-laura');
  });

  it('distingue ver de descargar', () => {
    const ver = verifyLink(issueLink('o', 'u', { mode: 'v' }));
    const bajar = verifyLink(issueLink('o', 'u', { mode: 'd' }));
    if (ver.ok && bajar.ok) {
      expect(ver.payload.m).toBe('v');
      expect(bajar.payload.m).toBe('d');
    }
  });
});
