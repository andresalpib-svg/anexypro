import { describe, it, expect } from 'vitest';
import { saldoParaMostrar, balanceCuadra } from '@/lib/domain/balance-presentacion';

/**
 * La vista contable calcula `débito − crédito` para todo, que es
 * correcto para la partida doble pero deja pasivo y patrimonio en
 * negativo. Estas pruebas fijan el criterio de presentación que ahora
 * comparten las dos pantallas y el PDF de estados financieros.
 */
describe('saldoParaMostrar', () => {
  it('el activo se muestra tal cual: su saldo natural es deudor', () => {
    expect(saldoParaMostrar('activo', 1_000_000)).toBe(1_000_000);
  });

  it('el pasivo se invierte: "Proveedores por Pagar −₡520 000" se leía al revés', () => {
    expect(saldoParaMostrar('pasivo', -520_000)).toBe(520_000);
  });

  it('el patrimonio también se invierte', () => {
    expect(saldoParaMostrar('patrimonio', -3_000_000)).toBe(3_000_000);
  });

  it('el ingreso se invierte; el gasto no', () => {
    expect(saldoParaMostrar('ingreso', -237_500)).toBe(237_500);
    expect(saldoParaMostrar('gasto', 495_000)).toBe(495_000);
  });

  it('un activo en negativo (sobregiro) sigue mostrándose en negativo', () => {
    // No es un cambio de signo cosmético: es el signo contable.
    expect(saldoParaMostrar('activo', -15_000)).toBe(-15_000);
  });
});

describe('balanceCuadra', () => {
  it('activo = pasivo + patrimonio con los saldos ya presentados', () => {
    const r = balanceCuadra([
      { type: 'activo', balance: 1_000_000 },
      { type: 'activo', balance: 130_000 },
      { type: 'pasivo', balance: -520_000 },
      { type: 'patrimonio', balance: -610_000 },
    ]);
    expect(r.activo).toBe(1_130_000);
    expect(r.pasivoMasPatrimonio).toBe(1_130_000);
    expect(r.cuadra).toBe(true);
  });

  it('detecta cuando NO cuadra', () => {
    const r = balanceCuadra([
      { type: 'activo', balance: 1_000_000 },
      { type: 'pasivo', balance: -400_000 },
    ]);
    expect(r.cuadra).toBe(false);
  });

  it('tolera un céntimo de diferencia — Postgres y JavaScript no redondean igual', () => {
    const r = balanceCuadra([
      { type: 'activo', balance: 1_000_000 },
      { type: 'pasivo', balance: -1_000_000.005 },
    ]);
    expect(r.cuadra).toBe(true);
  });

  it('ingresos y gastos no entran en el balance', () => {
    const r = balanceCuadra([
      { type: 'activo', balance: 500 },
      { type: 'pasivo', balance: -500 },
      { type: 'ingreso', balance: -900_000 },
      { type: 'gasto', balance: 900_000 },
    ]);
    expect(r.activo).toBe(500);
    expect(r.pasivoMasPatrimonio).toBe(500);
  });
});
