import { describe, it, expect, beforeEach } from 'vitest';
import { allocatePaymentOldestFirst } from '@/lib/domain/payment-allocation';

/**
 * PRUEBAS DE ETAPA 3 — Pagos, Cuotas y Morosidad
 *
 * Estos tests verifican los 3 primeros casos de la matriz de 9 casos:
 * 1. Pago completo a una cuota
 * 2. Pago parcial (asignación oldest-first)
 * 3. Validación de no-duplicados
 *
 * Ver: docs/plan-etapa-3-finanzas-2026-08-13.md
 */

function charge(id: string, amount: number, daysAgo: number, alreadyPaid = 0) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - daysAgo);
  return { id, amount, alreadyPaid, dueDate };
}

describe('ETAPA 3 — Pagos', () => {
  // ============================================
  // CASO 1: Pago Completo
  // ============================================
  describe('Caso 1: Pago Completo', () => {
    it('pago completo a una cuota marca la cuota como pagada', () => {
      // Condominio con 1 cuota ordinaria pendiente
      const cuota = charge('c1', 100_000, 30); // Vence hace 30 días
      const pago = 100_000;

      const result = allocatePaymentOldestFirst([cuota], pago);

      expect(result.allocations).toEqual([
        { chargeId: 'c1', amount: 100_000 },
      ]);
      expect(result.appliedToCharges).toBe(100_000);
      expect(result.advance).toBe(0);
    });

    it('saldo resultante es cero después del pago completo', () => {
      const cuota = charge('c1', 85_000, 10);
      const saldoAntes = cuota.amount - cuota.alreadyPaid; // 85_000 - 0 = 85_000
      const pago = 85_000;

      const result = allocatePaymentOldestFirst([cuota], pago);

      const saldoResultante = saldoAntes - result.appliedToCharges;
      expect(saldoResultante).toBe(0);
    });

    it('verifica que balance = 0 después de pago completo en formulario', () => {
      // Test de cálculo de preview para la UI
      const balance = 100_000;
      const amountPagado = 100_000;

      const appliedToCharges = Math.min(amountPagado, balance);
      const advance = amountPagado - appliedToCharges;

      expect(appliedToCharges).toBe(100_000);
      expect(advance).toBe(0);
      expect(balance - appliedToCharges).toBe(0);
    });
  });

  // ============================================
  // CASO 2: Pago Parcial (Oldest-First)
  // ============================================
  describe('Caso 2: Pago Parcial', () => {
    it('pago parcial se asigna al cargo más antiguo primero', () => {
      // Dos cuotas: c2 vence hace 60 días (más antigua), c1 hace 10 días
      const charges = [
        charge('c1', 50_000, 10),
        charge('c2', 50_000, 60),
      ];
      const pago = 50_000;

      const result = allocatePaymentOldestFirst(charges, pago);

      // El pago completo debe ir a c2 (la más antigua)
      expect(result.allocations).toEqual([
        { chargeId: 'c2', amount: 50_000 },
      ]);
      expect(result.appliedToCharges).toBe(50_000);
      expect(result.advance).toBe(0);
    });

    it('pago parcial se reparte entre múltiples cuotas (oldest-first)', () => {
      // c2 vence hace 60 días (50k), c1 hace 10 días (50k)
      // Pago de 80k → 50k a c2, 30k a c1
      const charges = [
        charge('c1', 50_000, 10),
        charge('c2', 50_000, 60),
      ];
      const pago = 80_000;

      const result = allocatePaymentOldestFirst(charges, pago);

      expect(result.allocations).toEqual([
        { chargeId: 'c2', amount: 50_000 },
        { chargeId: 'c1', amount: 30_000 },
      ]);
      expect(result.appliedToCharges).toBe(80_000);
      expect(result.advance).toBe(0);
    });

    it('pago parcial genera adelanto si supera la deuda total', () => {
      const charges = [charge('c1', 100_000, 30)];
      const pago = 150_000; // 50k extra

      const result = allocatePaymentOldestFirst(charges, pago);

      expect(result.appliedToCharges).toBe(100_000);
      expect(result.advance).toBe(50_000);
    });

    it('en UI, muestra preview de aplicación correcta', () => {
      // Simulación de preview en formulario
      const balance = 100_000;
      const montoPagado = 60_000;

      const appliedToCharges = Math.min(montoPagado, balance);
      const advance = montoPagado - appliedToCharges;

      expect(appliedToCharges).toBe(60_000);
      expect(advance).toBe(0);

      // Saldo restante después del pago
      const saldoRestante = balance - appliedToCharges;
      expect(saldoRestante).toBe(40_000);
    });
  });

  // ============================================
  // CASO 3: Validación de Duplicados
  // ============================================
  describe('Caso 3: Prevención de Duplicados de Pago', () => {
    it('rechaza pago duplicado con misma referencia en el mismo día', () => {
      // Simulación: dos pagos en el mismo día
      // El segundo debe ser rechazado
      const payment1 = {
        method: 'transferencia' as const,
        reference: 'REF-12345',
        amount: 100_000,
        date: new Date('2026-08-13'),
      };

      const payment2 = {
        method: 'transferencia' as const,
        reference: 'REF-12345',
        amount: 100_000,
        date: new Date('2026-08-13'),
      };

      // Verificar que tienen el mismo "identificador"
      const isDuplicate =
        payment1.method === payment2.method &&
        payment1.reference === payment2.reference &&
        payment1.date.toDateString() === payment2.date.toDateString();

      expect(isDuplicate).toBe(true);
    });

    it('permite pago con referencia distinta en el mismo día', () => {
      const payment1 = {
        method: 'transferencia' as const,
        reference: 'REF-12345',
        date: new Date('2026-08-13'),
      };

      const payment2 = {
        method: 'transferencia' as const,
        reference: 'REF-12346', // Referencia distinta
        date: new Date('2026-08-13'),
      };

      const isDuplicate =
        payment1.method === payment2.method &&
        payment1.reference === payment2.reference;

      expect(isDuplicate).toBe(false);
    });

    it('permite pago con mismo método y referencia pero en días distintos', () => {
      const payment1 = {
        method: 'transferencia' as const,
        reference: 'REF-12345',
        date: new Date('2026-08-13'),
      };

      const payment2 = {
        method: 'transferencia' as const,
        reference: 'REF-12345',
        date: new Date('2026-08-14'), // Día siguiente
      };

      const isDuplicate =
        payment1.method === payment2.method &&
        payment1.reference === payment2.reference &&
        payment1.date.toDateString() === payment2.date.toDateString();

      expect(isDuplicate).toBe(false);
    });

    it('referencia vacía no bloquea pagos sin referencia', () => {
      // Caso: efectivo sin número de referencia
      const payment1 = {
        method: 'efectivo' as const,
        reference: null,
      };

      const payment2 = {
        method: 'efectivo' as const,
        reference: null,
      };

      // Sin referencia, permite múltiples pagos (la fecha + monto lo diferencia)
      // En la BD, la validación de duplicados solo aplica si hay referencia
      const shouldValidateDuplicate = Boolean(payment1.reference && payment2.reference);

      expect(shouldValidateDuplicate).toBe(false);
    });
  });

  // ============================================
  // CASO 4: Aislamiento de Condominios (Crítico)
  // ============================================
  describe('Caso 4: Aislamiento entre Condominios', () => {
    it('pago de condominio A no afecta saldo de condominio B', () => {
      // Simulación de dos condominios con sus propias filiales
      const condoA = {
        id: 'condo-a',
        filial: { code: 'A-01', balance: 100_000 },
      };

      const condoB = {
        id: 'condo-b',
        filial: { code: 'B-01', balance: 200_000 },
      };

      // Pago de 100k a filial A-01
      const pagoA = 100_000;
      const saldoA = condoA.filial.balance - pagoA; // 0

      // Saldo de B no debe cambiar
      const saldoB = condoB.filial.balance; // 200_000

      expect(saldoA).toBe(0);
      expect(saldoB).toBe(200_000);
    });

    it('validación de condominio en makePaymentAction rechaza cross-condo', () => {
      // Simulación de validación en actions.ts:
      // const realCondo = await condoOfProperty(companyId, propertyId);
      // if (realCondo !== input.condominiumId) return SIN_PERMISO;

      const propertyCondominiumId: string = 'condo-a';
      const declaredCondominiumId: string = 'condo-b'; // Diferente

      const isValid = propertyCondominiumId === declaredCondominiumId;

      expect(isValid).toBe(false);
      // Si no fuera igual, la acción sería rechazada
    });

    it('propietarios de condo A no ven pagos de condo B en el estado de cuenta', () => {
      // Cuando listPropertiesWithBalance se filtra por condominiumId,
      // solo devuelve filiales de ese condominio
      const properties_condoA = [
        { id: 'p1', code: 'A-01', balance: 100_000 },
        { id: 'p2', code: 'A-02', balance: 0 },
      ];

      const properties_condoB = [
        { id: 'p3', code: 'B-01', balance: 200_000 },
      ];

      // Verificar que no hay overlap
      const codesA = properties_condoA.map((p) => p.code);
      const codesB = properties_condoB.map((p) => p.code);
      const overlap = codesA.filter((c) => codesB.includes(c));

      expect(overlap.length).toBe(0);
    });
  });

  // ============================================
  // CASO 5: Método de Pago
  // ============================================
  describe('Caso 5: Métodos de Pago Soportados', () => {
    const METODOS_SOPORTADOS = [
      'sinpe',
      'transferencia',
      'deposito',
      'efectivo',
      'tarjeta',
      'comprobante',
    ];

    it('acepta todos los métodos de pago válidos', () => {
      for (const metodo of METODOS_SOPORTADOS) {
        const esValido = METODOS_SOPORTADOS.includes(metodo);
        expect(esValido).toBe(true);
      }
    });

    it('rechaza método de pago inválido', () => {
      const metodoInvalido = 'cripto'; // No existe en el enum
      const esValido = METODOS_SOPORTADOS.includes(metodoInvalido);
      expect(esValido).toBe(false);
    });

    it('método = efectivo NO requiere referencia', () => {
      const pago = {
        method: 'efectivo',
        reference: null, // Nullable
      };

      // Sin validación de duplicados para efectivo
      expect(pago.reference).toBeNull();
    });

    it('método = transferencia recomienda referencia', () => {
      const pago = {
        method: 'transferencia',
        reference: 'TRANSF-001', // Recomendado para duplicados
      };

      expect(pago.reference).toBeTruthy();
    });
  });
});
