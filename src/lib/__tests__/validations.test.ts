import { describe, it, expect } from 'vitest';
import { condominiumSchema } from '@/lib/validations/condominium';
import { propertySchema } from '@/lib/validations/property';
import { paymentSchema, chargeSchema } from '@/lib/validations/finance';
import { reservationSchema } from '@/lib/validations/reservation';

describe('condominiumSchema', () => {
  const valid = {
    name: 'Vistas del Robledal',
    code: 'vdr',
    type: 'residencial',
    currency: 'CRC',
    baseFee: '85000',
    dueDay: '15',
    suspensionMonths: '3',
  };

  it('acepta datos válidos y normaliza el código a mayúsculas', () => {
    const result = condominiumSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe('VDR');
  });

  it('rechaza una cuota ordinaria negativa', () => {
    const result = condominiumSchema.safeParse({ ...valid, baseFee: '-100' });
    expect(result.success).toBe(false);
  });

  it('rechaza un código con caracteres inválidos', () => {
    const result = condominiumSchema.safeParse({ ...valid, code: 'vdr!!' });
    expect(result.success).toBe(false);
  });

  it('rechaza un día de vencimiento fuera de 1-28', () => {
    const result = condominiumSchema.safeParse({ ...valid, dueDay: '31' });
    expect(result.success).toBe(false);
  });

  it('rechaza un tipo de condominio inválido', () => {
    const result = condominiumSchema.safeParse({ ...valid, type: 'inventado' });
    expect(result.success).toBe(false);
  });
});

describe('propertySchema', () => {
  it('acepta una propiedad mínima válida', () => {
    const result = propertySchema.safeParse({
      condominiumId: '123e4567-e89b-12d3-a456-426614174000',
      code: 'A-101',
      propertyType: 'apartamento',
      parkingSpaces: '1',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un condominiumId que no es UUID', () => {
    const result = propertySchema.safeParse({
      condominiumId: 'no-es-un-uuid',
      code: 'A-101',
      propertyType: 'apartamento',
      parkingSpaces: '1',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un tipo de propiedad inválido', () => {
    const result = propertySchema.safeParse({
      condominiumId: '123e4567-e89b-12d3-a456-426614174000',
      code: 'A-101',
      propertyType: 'castillo',
      parkingSpaces: '1',
    });
    expect(result.success).toBe(false);
  });
});

describe('paymentSchema', () => {
  const base = { condominiumId: '123e4567-e89b-12d3-a456-426614174000', propertyId: '123e4567-e89b-12d3-a456-426614174001', method: 'sinpe' };

  it('rechaza un monto de pago igual a cero', () => {
    const result = paymentSchema.safeParse({ ...base, amount: '0' });
    expect(result.success).toBe(false);
  });

  it('rechaza un monto de pago negativo', () => {
    const result = paymentSchema.safeParse({ ...base, amount: '-500' });
    expect(result.success).toBe(false);
  });

  it('acepta un pago válido', () => {
    const result = paymentSchema.safeParse({ ...base, amount: '85000' });
    expect(result.success).toBe(true);
  });

  it('rechaza un método de pago inválido', () => {
    const result = paymentSchema.safeParse({ ...base, amount: '85000', method: 'criptomoneda' });
    expect(result.success).toBe(false);
  });
});

describe('chargeSchema', () => {
  const base = {
    condominiumId: '123e4567-e89b-12d3-a456-426614174000',
    propertyId: '123e4567-e89b-12d3-a456-426614174001',
    chargeType: 'multa',
    description: 'Ruido después de las 10pm',
    dueDate: '2026-08-01',
  };

  it('acepta un cargo válido', () => {
    expect(chargeSchema.safeParse({ ...base, amount: '25000' }).success).toBe(true);
  });

  it('rechaza un monto de cargo igual a cero', () => {
    expect(chargeSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
  });

  it('rechaza una descripción vacía', () => {
    expect(chargeSchema.safeParse({ ...base, amount: '25000', description: '' }).success).toBe(false);
  });
});

describe('reservationSchema', () => {
  const base = {
    condominiumId: '123e4567-e89b-12d3-a456-426614174000',
    amenityId: '123e4567-e89b-12d3-a456-426614174001',
    propertyId: '123e4567-e89b-12d3-a456-426614174002',
    resDate: '2026-08-15',
    startsAt: '14:00',
    endsAt: '18:00',
  };

  it('acepta una reserva válida', () => {
    expect(reservationSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza si falta la fecha', () => {
    expect(reservationSchema.safeParse({ ...base, resDate: '' }).success).toBe(false);
  });

  it('rechaza un amenityId que no es UUID', () => {
    expect(reservationSchema.safeParse({ ...base, amenityId: 'salon-social' }).success).toBe(false);
  });
});
