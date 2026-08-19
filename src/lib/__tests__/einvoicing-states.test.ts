import { describe, it, expect } from 'vitest';
import {
  puedeTransicionarModulo,
  puedeEmitir,
  SIGUIENTE_PASO,
  puedeTransicionarComprobante,
  esEstadoFinal,
  esEditable,
  requiereNotaParaCorregir,
  type EstadoModulo,
  type EstadoComprobante,
} from '@/lib/domain/einvoicing-states';
import { IMPLEMENTADOS, getProvider, hayProveedorDisponible, FacturacionNoImplementada } from '@/lib/einvoicing';
import { camposFaltantes } from '@/lib/services/einvoicing';

/**
 * La Etapa 9 PREPARA la facturación electrónica; no la activa. Estas
 * pruebas cuidan las dos mitades: que las reglas decididas sean las que
 * quedaron escritas, y que nada esté encendido.
 */

describe('El módulo está apagado', () => {
  it('no hay ningún proveedor implementado', () => {
    expect(IMPLEMENTADOS).toEqual([]);
    expect(hayProveedorDisponible()).toBe(false);
  });

  it('pedir un proveedor falla con un mensaje que explica por qué', () => {
    expect(() => getProvider('integracion_propia')).toThrow(FacturacionNoImplementada);
    expect(() => getProvider('proveedor_externo')).toThrow(/no está implementada/i);
  });

  it('ningún condominio puede emitir: todos nacen inactivos', () => {
    expect(puedeEmitir('inactivo', 'produccion')).toBe(false);
    expect(puedeEmitir('inactivo', 'pruebas')).toBe(false);
  });

  it('estar activo en PRUEBAS no habilita a emitir de verdad', () => {
    // Es el error clásico: se prueba en sandbox, se deja activo y se
    // empieza a emitir contra un ambiente que no vale.
    expect(puedeEmitir('activo', 'pruebas')).toBe(false);
    expect(puedeEmitir('activo', 'produccion')).toBe(true);
  });
});

describe('Flujo de activación del módulo', () => {
  it('el camino completo es configurar → validar → probar → activar', () => {
    const camino: EstadoModulo[] = ['inactivo', 'configurado', 'validado', 'probado', 'activo'];
    for (let i = 0; i < camino.length - 1; i++) {
      expect(puedeTransicionarModulo(camino[i]!, camino[i + 1]!)).toBe(true);
    }
  });

  it('no se puede saltar ningún paso', () => {
    expect(puedeTransicionarModulo('inactivo', 'activo')).toBe(false);
    expect(puedeTransicionarModulo('inactivo', 'probado')).toBe(false);
    expect(puedeTransicionarModulo('configurado', 'activo')).toBe(false);
    // Activar sin haber probado la conexión es exactamente lo que este
    // flujo existe para impedir.
    expect(puedeTransicionarModulo('validado', 'activo')).toBe(false);
  });

  it('editar la configuración obliga a validar de nuevo', () => {
    // Cambiar la cédula y seguir "validado" sería mentira.
    expect(puedeTransicionarModulo('validado', 'configurado')).toBe(true);
    expect(puedeTransicionarModulo('probado', 'configurado')).toBe(true);
  });

  it('suspender y reactivar no obliga a repetir todo el camino', () => {
    expect(puedeTransicionarModulo('activo', 'suspendido')).toBe(true);
    expect(puedeTransicionarModulo('suspendido', 'activo')).toBe(true);
  });

  it('cada estado dice qué falta, salvo el activo', () => {
    expect(SIGUIENTE_PASO.inactivo).toMatch(/configuración fiscal/i);
    expect(SIGUIENTE_PASO.validado).toMatch(/conexión/i);
    expect(SIGUIENTE_PASO.activo).toBeNull();
  });
});

describe('Ciclo de vida de un comprobante', () => {
  it('el camino feliz es borrador → generado → enviado → aceptado', () => {
    const camino: EstadoComprobante[] = ['borrador', 'generado', 'enviado', 'aceptado'];
    for (let i = 0; i < camino.length - 1; i++) {
      expect(puedeTransicionarComprobante(camino[i]!, camino[i + 1]!)).toBe(true);
    }
  });

  it('un comprobante emitido NUNCA vuelve a borrador', () => {
    // Es lo que impide maquillar el historial. Lo refuerza además un
    // disparador en la base (07_facturacion_electronica.sql).
    for (const estado of ['generado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error'] as EstadoComprobante[]) {
      expect(puedeTransicionarComprobante(estado, 'borrador')).toBe(false);
    }
  });

  it('solo el borrador es editable', () => {
    expect(esEditable('borrador')).toBe(true);
    for (const estado of ['generado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error'] as EstadoComprobante[]) {
      expect(esEditable(estado)).toBe(false);
    }
  });

  it('lo ya emitido se corrige con nota de crédito o débito, no editando', () => {
    expect(requiereNotaParaCorregir('generado')).toBe(true);
    expect(requiereNotaParaCorregir('enviado')).toBe(true);
    expect(requiereNotaParaCorregir('aceptado')).toBe(true);
    // Un rechazado no llegó a existir para Hacienda: se emite otro.
    expect(requiereNotaParaCorregir('rechazado')).toBe(false);
    expect(requiereNotaParaCorregir('borrador')).toBe(false);
  });

  it('Hacienda no se desdice: aceptado y rechazado no se cruzan', () => {
    expect(puedeTransicionarComprobante('aceptado', 'rechazado')).toBe(false);
    expect(puedeTransicionarComprobante('rechazado', 'aceptado')).toBe(false);
  });

  it('un error de comunicación se reintenta; un rechazo no', () => {
    // La distinción importa: el error es de transporte y el comprobante
    // sigue siendo válido; el rechazo es de fondo.
    expect(puedeTransicionarComprobante('error', 'enviado')).toBe(true);
    expect(esEstadoFinal('error')).toBe(false);
    expect(esEstadoFinal('rechazado')).toBe(true);
  });

  it('aceptado y anulado son finales salvo la anulación', () => {
    expect(puedeTransicionarComprobante('aceptado', 'anulado')).toBe(true);
    expect(esEstadoFinal('anulado')).toBe(true);
  });
});

describe('Validación de la configuración fiscal', () => {
  it('una configuración vacía reporta todos los campos que faltan', () => {
    const faltan = camposFaltantes({});
    expect(faltan).toContain('identificationNumber');
    expect(faltan).toContain('economicActivityCode');
    // No se asume que todos los condominios compartan situación
    // tributaria: cada uno declara la suya y es obligatoria.
    expect(faltan).toContain('taxConditionCode');
    expect(faltan).toContain('taxRegimeCode');
  });

  it('una cadena vacía cuenta como faltante, no como dato', () => {
    expect(camposFaltantes({ legalName: '' })).toContain('legalName');
  });

  it('con todo cargado no falta nada', () => {
    const completa = {
      identificationTypeCode: '02',
      identificationNumber: '3101123456',
      legalName: 'Condominio Ejemplo S.A.',
      economicActivityCode: '681000',
      email: 'admin@ejemplo.cr',
      provinceCode: '1',
      cantonCode: '01',
      districtCode: '01',
      taxConditionCode: '01',
      taxRegimeCode: '01',
    };
    expect(camposFaltantes(completa)).toEqual([]);
  });
});
