import { describe, it, expect } from 'vitest';
import { checkJournalBalance } from '@/lib/domain/journal-balance';

describe('checkJournalBalance', () => {
  it('acepta un asiento balanceado de dos líneas', () => {
    const result = checkJournalBalance([
      { accountCode: '1101', debit: 85000 },
      { accountCode: '4001', credit: 85000 },
    ]);
    expect(result.balanced).toBe(true);
    expect(result.totalDebit).toBe(85000);
    expect(result.totalCredit).toBe(85000);
  });

  it('acepta un asiento balanceado de tres líneas (pago con adelanto)', () => {
    // Débito Banco 100000 / Crédito CxC 85000 / Crédito Adelantos 15000
    const result = checkJournalBalance([
      { accountCode: '1001', debit: 100000 },
      { accountCode: '1101', credit: 85000 },
      { accountCode: '2002', credit: 15000 },
    ]);
    expect(result.balanced).toBe(true);
  });

  it('rechaza un asiento descuadrado', () => {
    const result = checkJournalBalance([
      { accountCode: '1101', debit: 85000 },
      { accountCode: '4001', credit: 80000 },
    ]);
    expect(result.balanced).toBe(false);
    expect(result.error).toMatch(/descuadrado/);
  });

  it('rechaza una línea con débito y crédito a la vez', () => {
    const result = checkJournalBalance([
      { accountCode: '1101', debit: 100, credit: 50 },
      { accountCode: '4001', credit: 50 },
    ]);
    expect(result.balanced).toBe(false);
    expect(result.error).toMatch(/débito y crédito a la vez/);
  });

  it('rechaza una línea sin ningún monto', () => {
    const result = checkJournalBalance([
      { accountCode: '1101', debit: 100 },
      { accountCode: '4001' },
    ]);
    expect(result.balanced).toBe(false);
  });

  it('rechaza un asiento vacío', () => {
    const result = checkJournalBalance([]);
    expect(result.balanced).toBe(false);
  });

  it('no genera falsos negativos por errores de punto flotante', () => {
    // 0.1 + 0.2 !== 0.3 en punto flotante crudo — debe seguir cuadrando
    const result = checkJournalBalance([
      { accountCode: '1101', debit: 0.1 },
      { accountCode: '1101', debit: 0.2 },
      { accountCode: '4001', credit: 0.3 },
    ]);
    expect(result.balanced).toBe(true);
  });
});
