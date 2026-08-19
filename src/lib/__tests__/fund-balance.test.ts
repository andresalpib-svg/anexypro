import { describe, it, expect } from 'vitest';
import { buildFundBalance, type FundMovementInput } from '@/lib/domain/fund-balance';

const mov = (movType: FundMovementInput['movType'], amount: number): FundMovementInput => ({ movType, amount });

describe('saldo de un fondo', () => {
  it('un fondo sin movimientos no rompe el cálculo', () => {
    const b = buildFundBalance([]);
    expect(b).toEqual({ operativo: 0, comprometido: 0, invertido: 0, total: 0 });
  });

  // Caso de regresión de la migración: ReserveFund solo tenía
  // aporte/uso — debe seguir dando exactamente el mismo saldo que
  // `getReserveFund` calculaba antes (aporte − uso, todo operativo).
  it('solo aporte/uso: todo queda operativo, igual que el fondo de reserva legado', () => {
    const b = buildFundBalance([mov('aporte', 500_000), mov('aporte', 100_000), mov('uso', 150_000)]);
    expect(b.total).toBe(450_000);
    expect(b.operativo).toBe(450_000);
    expect(b.comprometido).toBe(0);
    expect(b.invertido).toBe(0);
  });

  it('un compromiso aparta dinero de lo operativo sin cambiar el total', () => {
    const b = buildFundBalance([mov('aporte', 1_000_000), mov('compromiso', 300_000)]);
    expect(b.total).toBe(1_000_000);
    expect(b.comprometido).toBe(300_000);
    expect(b.operativo).toBe(700_000);
  });

  it('liberar un compromiso lo devuelve a operativo', () => {
    const b = buildFundBalance([mov('aporte', 1_000_000), mov('compromiso', 300_000), mov('liberacion', 300_000)]);
    expect(b.comprometido).toBe(0);
    expect(b.operativo).toBe(1_000_000);
  });

  it('una inversión saca dinero de lo operativo sin cambiar el total del fondo', () => {
    const b = buildFundBalance([mov('aporte', 1_000_000), mov('inversion', 400_000)]);
    expect(b.total).toBe(1_000_000);
    expect(b.invertido).toBe(400_000);
    expect(b.operativo).toBe(600_000);
  });

  it('el retorno de una inversión la devuelve a operativo', () => {
    const b = buildFundBalance([mov('aporte', 1_000_000), mov('inversion', 400_000), mov('retorno', 400_000)]);
    expect(b.invertido).toBe(0);
    expect(b.operativo).toBe(1_000_000);
  });

  it('escenario combinado: aporte, compromiso e inversión conviven sin mezclarse', () => {
    const b = buildFundBalance([
      mov('aporte', 2_000_000),
      mov('uso', 200_000),
      mov('compromiso', 300_000),
      mov('inversion', 500_000),
    ]);
    expect(b.total).toBe(1_800_000); // 2.000.000 − 200.000
    expect(b.comprometido).toBe(300_000);
    expect(b.invertido).toBe(500_000);
    expect(b.operativo).toBe(1_000_000); // 1.800.000 − 300.000 − 500.000
  });
});
