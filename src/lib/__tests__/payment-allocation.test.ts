import { describe, it, expect } from 'vitest';
import { allocatePaymentOldestFirst, type PendingCharge } from '@/lib/domain/payment-allocation';

function charge(id: string, amount: number, daysAgo: number, alreadyPaid = 0): PendingCharge {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - daysAgo);
  return { id, amount, alreadyPaid, dueDate };
}

describe('allocatePaymentOldestFirst', () => {
  it('aplica el pago completo a un único cargo pendiente', () => {
    const result = allocatePaymentOldestFirst([charge('c1', 85000, 30)], 85000);
    expect(result.allocations).toEqual([{ chargeId: 'c1', amount: 85000 }]);
    expect(result.appliedToCharges).toBe(85000);
    expect(result.advance).toBe(0);
  });

  it('aplica al cargo más antiguo primero, sin importar el orden de entrada', () => {
    // c2 vence hace 60 días (más antiguo), c1 hace 10 — debe aplicarse a c2 primero
    const charges = [charge('c1', 50000, 10), charge('c2', 50000, 60)];
    const result = allocatePaymentOldestFirst(charges, 50000);
    expect(result.allocations).toEqual([{ chargeId: 'c2', amount: 50000 }]);
  });

  it('reparte un pago entre varios cargos pendientes, del más antiguo al más reciente', () => {
    const charges = [charge('c1', 50000, 10), charge('c2', 50000, 60)];
    const result = allocatePaymentOldestFirst(charges, 80000);
    expect(result.allocations).toEqual([
      { chargeId: 'c2', amount: 50000 },
      { chargeId: 'c1', amount: 30000 },
    ]);
    expect(result.appliedToCharges).toBe(80000);
    expect(result.advance).toBe(0);
  });

  it('registra el excedente como adelanto cuando el pago supera lo pendiente', () => {
    const result = allocatePaymentOldestFirst([charge('c1', 85000, 30)], 100000);
    expect(result.appliedToCharges).toBe(85000);
    expect(result.advance).toBe(15000);
  });

  it('registra TODO el pago como adelanto si no hay ningún cargo pendiente', () => {
    const result = allocatePaymentOldestFirst([], 50000);
    expect(result.allocations).toEqual([]);
    expect(result.appliedToCharges).toBe(0);
    expect(result.advance).toBe(50000);
  });

  it('respeta lo que ya estaba parcialmente pagado de un cargo', () => {
    // el cargo ya tiene 60000 aplicados de 85000 — solo debe faltar 25000
    const result = allocatePaymentOldestFirst([charge('c1', 85000, 30, 60000)], 25000);
    expect(result.allocations).toEqual([{ chargeId: 'c1', amount: 25000 }]);
    expect(result.advance).toBe(0);
  });

  it('nunca aplica más de lo que un cargo debe, aunque sobre dinero', () => {
    const result = allocatePaymentOldestFirst([charge('c1', 10000, 30, 8000)], 5000);
    // el cargo solo debe 2000 — el resto (3000) queda como adelanto
    expect(result.allocations).toEqual([{ chargeId: 'c1', amount: 2000 }]);
    expect(result.advance).toBe(3000);
  });
});
