import { describe, it, expect } from 'vitest';
import { classify, normalize, SUGGESTED_QUESTIONS } from '@/lib/domain/assistant-intents';

describe('normalización de la pregunta', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(normalize('¿Por qué aumentaron los GASTOS?')).toBe('por que aumentaron los gastos');
  });
});

describe('clasificación de intención', () => {
  // Las seis preguntas del diseño tienen que clasificar bien: si esta
  // parte falla, la respuesta se construye sobre los datos equivocados.
  it('clasifica correctamente las preguntas sugeridas', () => {
    for (const q of SUGGESTED_QUESTIONS) {
      expect(classify(q.text).intent, `falló: "${q.text}"`).toBe(q.intent);
    }
  });

  it('entiende variantes de la misma pregunta', () => {
    expect(classify('por qué subieron los gastos').intent).toBe('gastos_variacion');
    expect(classify('quiénes están atrasados con la cuota').intent).toBe('morosidad');
    expect(classify('a qué proveedor le pagamos más').intent).toBe('proveedores');
    expect(classify('qué partidas se excedieron').intent).toBe('presupuesto');
    expect(classify('hay algo pendiente de aprobación').intent).toBe('aprobaciones');
    expect(classify('nos alcanza el efectivo').intent).toBe('liquidez');
  });

  it('funciona sin tildes ni signos', () => {
    expect(classify('quienes presentan mayor morosidad').intent).toBe('morosidad');
    expect(classify('QUE PRESUPUESTO ESTA EXCEDIDO').intent).toBe('presupuesto');
  });

  it('cae en resumen cuando no reconoce nada', () => {
    expect(classify('hola').intent).toBe('resumen');
    expect(classify('').intent).toBe('resumen');
    expect(classify('cuéntame un chiste').intent).toBe('resumen');
  });

  it('reconoce la petición de un panorama general', () => {
    expect(classify('¿cómo vamos este mes?').intent).toBe('resumen');
    expect(classify('dame un resumen').intent).toBe('resumen');
  });

  it('reporta la confianza y los términos que reconoció', () => {
    const r = classify('¿quiénes presentan mayor morosidad?');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.matched.length).toBeGreaterThan(0);
  });

  it('la pregunta de cobranza no se confunde con la de gastos', () => {
    expect(classify('a quién hay que cobrarle').intent).toBe('morosidad');
    expect(classify('cuánto gastamos en mantenimiento').intent).toBe('gastos_variacion');
  });
});
