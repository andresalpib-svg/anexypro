/**
 * Reglas puras de aplicación de pagos — sin dependencia de Prisma,
 * para poder probarlas de forma aislada. src/lib/services/finance.ts
 * (makePayment) usa esta misma función antes de escribir las
 * payment_allocations reales.
 */

export type PendingCharge = { id: string; amount: number; alreadyPaid: number; dueDate: Date };

export type Allocation = { chargeId: string; amount: number };

export type AllocationResult = {
  allocations: Allocation[];
  appliedToCharges: number;
  advance: number; // excedente que no se pudo aplicar a ningún cargo — se registra como Adelanto de Condómino
};

/**
 * Aplica `amount` a los cargos pendientes ordenados por fecha de
 * vencimiento (el más antiguo primero) — misma regla que el
 * prototipo. Nunca sobre-aplica a un cargo (respeta lo que ya estaba
 * pagado de cada uno). Lo que sobra después de cubrir todos los
 * cargos pendientes queda como `advance`, nunca se pierde.
 */
export function allocatePaymentOldestFirst(pendingCharges: PendingCharge[], amount: number): AllocationResult {
  const sorted = [...pendingCharges].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  let remaining = amount;
  let appliedToCharges = 0;
  const allocations: Allocation[] = [];

  for (const charge of sorted) {
    if (remaining <= 0) break;
    const owed = round2(charge.amount - charge.alreadyPaid);
    if (owed <= 0) continue;
    const toApply = round2(Math.min(owed, remaining));
    allocations.push({ chargeId: charge.id, amount: toApply });
    remaining = round2(remaining - toApply);
    appliedToCharges = round2(appliedToCharges + toApply);
  }

  return { allocations, appliedToCharges, advance: round2(Math.max(0, remaining)) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
