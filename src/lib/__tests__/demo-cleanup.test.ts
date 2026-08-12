import { describe, it, expect } from 'vitest';
import {
  evaluatePurgeEligibility,
  isAlreadyPurged,
  orderFoldersDeepestFirst,
  evaluateOwnership,
  isFolderReallyEmpty,
  summarizeCleanup,
  type CleanupItemResult,
} from '@/lib/domain/demo-cleanup';

describe('evaluatePurgeEligibility()', () => {
  const base = {
    isDemo: true,
    demoStatus: 'DEMO_VENCIDO' as const,
    demoDeleteScheduledAt: new Date('2026-08-19T10:00:00Z'),
    now: new Date('2026-08-19T10:00:01Z'),
  };

  it('permite purgar una demo vencida cuando ya pasó el día 18', () => {
    expect(evaluatePurgeEligibility(base)).toEqual({ allowed: true });
  });

  it('rechaza una empresa que no es demo, pase lo que pase con las fechas', () => {
    const r = evaluatePurgeEligibility({ ...base, isDemo: false });
    expect(r.allowed).toBe(false);
  });

  it('NUNCA permite purgar una demo convertida a cliente formal', () => {
    const r = evaluatePurgeEligibility({ ...base, demoStatus: 'DEMO_CONVERTIDO', force: true });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/nunca se purga/i);
  });

  it('rechaza una demo todavía activa', () => {
    const r = evaluatePurgeEligibility({ ...base, demoStatus: 'DEMO_ACTIVO' });
    expect(r.allowed).toBe(false);
  });

  it('rechaza una demo ya eliminada (ese caso lo filtra isAlreadyPurged, no esta función)', () => {
    const r = evaluatePurgeEligibility({ ...base, demoStatus: 'DEMO_ELIMINADO' });
    expect(r.allowed).toBe(false);
  });

  it('permite reintentar una limpieza que había fallado', () => {
    const r = evaluatePurgeEligibility({ ...base, demoStatus: 'DEMO_CLEANUP_FAILED' });
    expect(r.allowed).toBe(true);
  });

  it('rechaza una demo vencida si todavía no llega su fecha de eliminación programada (día 18)', () => {
    const r = evaluatePurgeEligibility({
      ...base,
      now: new Date('2026-08-17T00:00:00Z'), // vencida, pero antes del día 18
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toMatch(/todavía no llegó/i);
  });

  it('acepta el instante EXACTO de la fecha programada (>=, no solo >)', () => {
    const r = evaluatePurgeEligibility({ ...base, now: base.demoDeleteScheduledAt });
    expect(r.allowed).toBe(true);
  });

  it('rechaza sin `demoDeleteScheduledAt` definido, salvo con `force`', () => {
    const sinFecha = evaluatePurgeEligibility({ ...base, demoDeleteScheduledAt: null });
    expect(sinFecha.allowed).toBe(false);

    const forzado = evaluatePurgeEligibility({ ...base, demoDeleteScheduledAt: null, force: true });
    expect(forzado.allowed).toBe(true);
  });

  it('`force` salta la comprobación de fecha aunque falten días', () => {
    const r = evaluatePurgeEligibility({ ...base, now: new Date('2026-08-01T00:00:00Z'), force: true });
    expect(r.allowed).toBe(true);
  });
});

describe('isAlreadyPurged()', () => {
  it('solo es verdadero para DEMO_ELIMINADO', () => {
    expect(isAlreadyPurged('DEMO_ELIMINADO')).toBe(true);
    expect(isAlreadyPurged('DEMO_VENCIDO')).toBe(false);
    expect(isAlreadyPurged('DEMO_CLEANUP_FAILED')).toBe(false);
    expect(isAlreadyPurged(null)).toBe(false);
  });
});

describe('orderFoldersDeepestFirst()', () => {
  it('ordena las hojas antes que la raíz', () => {
    // raiz -> a -> b (hoja)
    const folders = [
      { id: 'raiz', parentId: null },
      { id: 'a', parentId: 'raiz' },
      { id: 'b', parentId: 'a' },
    ];
    const orden = orderFoldersDeepestFirst(folders).map((f) => f.id);
    expect(orden).toEqual(['b', 'a', 'raiz']);
  });

  it('mantiene el orden correcto con varias ramas de distinta profundidad', () => {
    const folders = [
      { id: 'raiz', parentId: null },
      { id: 'seccion', parentId: 'raiz' },
      { id: 'subseccion', parentId: 'seccion' },
      { id: 'otra-seccion', parentId: 'raiz' },
    ];
    const orden = orderFoldersDeepestFirst(folders).map((f) => f.id);
    // 'subseccion' (profundidad 2) antes que las de profundidad 1, y 'raiz' (0) al final.
    expect(orden.indexOf('subseccion')).toBeLessThan(orden.indexOf('seccion'));
    expect(orden.indexOf('seccion')).toBeLessThan(orden.indexOf('raiz'));
    expect(orden.indexOf('otra-seccion')).toBeLessThan(orden.indexOf('raiz'));
  });

  it('no se cuelga ante un ciclo corrupto en parentId', () => {
    const folders = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
    ];
    expect(() => orderFoldersDeepestFirst(folders)).not.toThrow();
  });
});

describe('evaluateOwnership()', () => {
  it('elimina cuando el único padre coincide con lo esperado y no está compartido', () => {
    const r = evaluateOwnership({ exists: true, parents: ['carpeta-esperada'], shared: false }, 'carpeta-esperada');
    expect(r.action).toBe('eliminar');
  });

  it('trata "ya no existe" como éxito idempotente, no como fallo', () => {
    const r = evaluateOwnership({ exists: false, parents: [], shared: false }, 'carpeta-esperada');
    expect(r.action).toBe('ya_no_existía');
  });

  it('NUNCA borra algo que el proveedor reporta como compartido', () => {
    const r = evaluateOwnership({ exists: true, parents: ['carpeta-esperada'], shared: true }, 'carpeta-esperada');
    expect(r.action).toBe('omitir');
  });

  it('NUNCA borra si el padre real no coincide con el esperado (aunque el nombre de la carpeta coincida)', () => {
    const r = evaluateOwnership({ exists: true, parents: ['otra-carpeta'], shared: false }, 'carpeta-esperada');
    expect(r.action).toBe('omitir');
  });

  it('NUNCA borra un archivo con más de un padre (vive en otro lugar también)', () => {
    const r = evaluateOwnership(
      { exists: true, parents: ['carpeta-esperada', 'otra-carpeta'], shared: false },
      'carpeta-esperada'
    );
    expect(r.action).toBe('omitir');
  });

  it('NUNCA borra un recurso sin padres reportados', () => {
    const r = evaluateOwnership({ exists: true, parents: [], shared: false }, 'carpeta-esperada');
    expect(r.action).toBe('omitir');
  });
});

describe('isFolderReallyEmpty()', () => {
  it('vacía cuando el proveedor no reporta hijos', () => {
    expect(isFolderReallyEmpty({ folders: [], files: [] })).toBe(true);
  });

  it('NO vacía si queda una subcarpeta viva, aunque la base la crea vacía', () => {
    expect(isFolderReallyEmpty({ folders: [{}], files: [] })).toBe(false);
  });

  it('NO vacía si queda un archivo huérfano no identificado', () => {
    expect(isFolderReallyEmpty({ folders: [], files: [{}] })).toBe(false);
  });
});

describe('summarizeCleanup()', () => {
  const archivo = (outcome: CleanupItemResult['outcome'], id = 'f1'): CleanupItemResult => ({
    kind: 'archivo',
    id,
    providerId: `drive-${id}`,
    name: `${id}.pdf`,
    outcome,
  });
  const carpeta = (outcome: CleanupItemResult['outcome'], id = 'c1'): CleanupItemResult => ({
    kind: 'carpeta',
    id,
    providerId: `drive-${id}`,
    name: id,
    outcome,
  });

  it('DEMO_ELIMINADO cuando todo se borró', () => {
    const r = summarizeCleanup([archivo('eliminado'), carpeta('eliminado')]);
    expect(r.finalStatus).toBe('DEMO_ELIMINADO');
    expect(r.filesFound).toBe(1);
    expect(r.filesDeleted).toBe(1);
    expect(r.foldersFound).toBe(1);
    expect(r.foldersDeleted).toBe(1);
    expect(r.failed).toHaveLength(0);
  });

  it('DEMO_ELIMINADO cuando lo que faltaba ya no existía (reintento sobre una corrida previa exitosa a medias)', () => {
    const r = summarizeCleanup([archivo('ya_no_existía')]);
    expect(r.finalStatus).toBe('DEMO_ELIMINADO');
    expect(r.filesDeleted).toBe(1);
  });

  it('DEMO_CLEANUP_FAILED si UN SOLO elemento quedó omitido, aunque el resto se haya borrado', () => {
    const r = summarizeCleanup([archivo('eliminado', 'f1'), archivo('omitido', 'f2'), carpeta('eliminado')]);
    expect(r.finalStatus).toBe('DEMO_CLEANUP_FAILED');
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.id).toBe('f2');
  });

  it('DEMO_CLEANUP_FAILED ante un error de proveedor', () => {
    const r = summarizeCleanup([archivo('error')]);
    expect(r.finalStatus).toBe('DEMO_CLEANUP_FAILED');
  });

  it('sin elementos: DEMO_ELIMINADO (nada que borrar es un éxito trivial)', () => {
    const r = summarizeCleanup([]);
    expect(r.finalStatus).toBe('DEMO_ELIMINADO');
    expect(r.filesFound).toBe(0);
    expect(r.foldersFound).toBe(0);
  });
});
