import { describe, it, expect } from 'vitest';
import { diffCampos } from '@/lib/services/audit-trail';

/**
 * El rastro de cambios existe para responder "qué decía antes". Si
 * `diffCampos` inventa cambios que no ocurrieron, la bitácora se llena
 * de ruido y deja de servir; si se come cambios reales, miente.
 */
describe('diffCampos — qué cambió de verdad', () => {
  it('solo devuelve los campos que cambiaron', () => {
    const cambios = diffCampos(
      { monto: 100, descripcion: 'Vigilancia', estado: 'aprobado' },
      { monto: 250, descripcion: 'Vigilancia', estado: 'anulado' }
    );
    expect(cambios).toEqual([
      { campo: 'monto', antes: 100, despues: 250 },
      { campo: 'estado', antes: 'aprobado', despues: 'anulado' },
    ]);
  });

  it('sin cambios devuelve una lista vacía, no un cambio falso', () => {
    expect(diffCampos({ monto: 100 }, { monto: 100 })).toEqual([]);
  });

  it('los Decimal de Prisma NO cuentan como cambio si valen lo mismo', () => {
    // Son dos objetos distintos: comparados con `!==` darían "cambió"
    // en cada guardado, aunque nadie hubiera tocado nada.
    const decimal = (v: string) => ({ toNumber: () => Number(v), toString: () => v });
    expect(diffCampos({ monto: decimal('2500.00') }, { monto: decimal('2500.00') })).toEqual([]);
    expect(diffCampos({ monto: decimal('2500.00') }, { monto: decimal('900.00') })).toEqual([
      { campo: 'monto', antes: 2500, despues: 900 },
    ]);
  });

  it('las fechas se comparan por valor, no por identidad de objeto', () => {
    expect(diffCampos({ f: new Date('2026-08-01') }, { f: new Date('2026-08-01') })).toEqual([]);
    expect(diffCampos({ f: new Date('2026-08-01') }, { f: new Date('2026-09-01') })).toEqual([
      { campo: 'f', antes: '2026-08-01T00:00:00.000Z', despues: '2026-09-01T00:00:00.000Z' },
    ]);
  });

  it('null y undefined son lo mismo — un campo ausente no es un cambio', () => {
    expect(diffCampos({ nota: null }, { nota: undefined })).toEqual([]);
  });

  it('un campo que aparece o desaparece SÍ es un cambio', () => {
    expect(diffCampos({}, { motivo: 'Duplicado' })).toEqual([
      { campo: 'motivo', antes: null, despues: 'Duplicado' },
    ]);
    expect(diffCampos({ motivo: 'Duplicado' }, {})).toEqual([
      { campo: 'motivo', antes: 'Duplicado', despues: null },
    ]);
  });

  it('un booleano en false no se confunde con ausente', () => {
    // Importa para los permisos: "revocado" (false) y "sin definir"
    // (ausente = permitido) son estados distintos.
    expect(diffCampos({ finanzas: true }, { finanzas: false })).toEqual([
      { campo: 'finanzas', antes: true, despues: false },
    ]);
    expect(diffCampos({ finanzas: false }, {})).toEqual([
      { campo: 'finanzas', antes: false, despues: null },
    ]);
  });
});
