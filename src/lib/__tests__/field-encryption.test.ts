import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';

// La clave se genera acá, no se lee de .env: la prueba no depende de
// ningún secreto real y corre igual en CI, donde FIELD_ENCRYPTION_KEY
// no está definida.
beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('field-encryption', () => {
  it('cifra y descifra de vuelta al mismo valor', async () => {
    const { encryptField, decryptField } = await import('../crypto/field-encryption');
    const original = 'CR21-0102-0123-4567-8901-2345';
    const cifrado = encryptField(original);
    expect(cifrado).not.toBeNull();
    expect(cifrado).not.toBe(original);
    expect(cifrado!.startsWith('enc:v1:')).toBe(true);
    expect(decryptField(cifrado)).toBe(original);
  });

  it('null y undefined pasan sin tocar', async () => {
    const { encryptField, decryptField } = await import('../crypto/field-encryption');
    expect(encryptField(null)).toBeNull();
    expect(encryptField(undefined)).toBeNull();
    expect(decryptField(null)).toBeNull();
    expect(decryptField(undefined)).toBeNull();
  });

  it('cadena vacía pasa sin tocar (no la marca como cifrada)', async () => {
    const { encryptField, decryptField } = await import('../crypto/field-encryption');
    expect(encryptField('')).toBe('');
    expect(decryptField('')).toBe('');
  });

  it('un valor sin el prefijo se trata como texto plano heredado', async () => {
    const { decryptField } = await import('../crypto/field-encryption');
    // Fila que todavía no pasó por scripts/cifrar-datos-bancarios.ts.
    expect(decryptField('001-0234567-8')).toBe('001-0234567-8');
  });

  it('dos cifrados del mismo valor no son iguales (IV distinto)', async () => {
    const { encryptField } = await import('../crypto/field-encryption');
    const a = encryptField('mismo-valor');
    const b = encryptField('mismo-valor');
    expect(a).not.toBe(b);
  });

  it('estaCifrado distingue cifrado de texto plano', async () => {
    const { encryptField, estaCifrado } = await import('../crypto/field-encryption');
    expect(estaCifrado(encryptField('x'))).toBe(true);
    expect(estaCifrado('texto plano')).toBe(false);
    expect(estaCifrado(null)).toBe(false);
  });

  it('un texto cifrado manipulado falla al descifrar en vez de devolver basura', async () => {
    const { encryptField, decryptField } = await import('../crypto/field-encryption');
    const cifrado = encryptField('valor-sensible')!;
    const manipulado = cifrado.slice(0, -4) + 'AAAA';
    expect(() => decryptField(manipulado)).toThrow();
  });

  it('sin FIELD_ENCRYPTION_KEY, cifrar da un error claro (no un fallo críptico)', async () => {
    const clavePrevia = process.env.FIELD_ENCRYPTION_KEY;
    delete process.env.FIELD_ENCRYPTION_KEY;
    // Módulo fresco: el caché de la clave vive en el módulo importado
    // arriba, así que hay que reimportarlo aislado de ese caché.
    await import('vitest').then(({ vi }) => vi.resetModules());
    const { encryptField } = await import('../crypto/field-encryption');
    expect(() => encryptField('x')).toThrow(/FIELD_ENCRYPTION_KEY/);
    process.env.FIELD_ENCRYPTION_KEY = clavePrevia;
  });
});
