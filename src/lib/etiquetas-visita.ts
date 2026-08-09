import type { VisitType, VisitStatus } from '@prisma/client';

/**
 * Cómo se llaman los tipos y estados de visita en pantalla.
 *
 * POR QUÉ ESTÁ CENTRALIZADO: había tres mapas distintos —panel, portal
 * y caseta— y al panel le faltaban `empleado` y `suspendida`, así que
 * esas celdas salían VACÍAS (prueba por rol del 2026-08-08). Al estar
 * tipados como `Record<VisitType, string>`, agregar un valor al enum de
 * Prisma sin rotularlo aquí ya no compila: el error salta al construir,
 * no en la pantalla del administrador.
 */
export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  rapida: 'Visita rápida',
  recurrente: 'Recurrente',
  entrega: 'Entrega',
  empleado: 'Empleado',
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  vigente: 'Vigente',
  usada: 'Usada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
  suspendida: 'Suspendida',
};

export const VISIT_STATUS_VARIANT: Record<VisitStatus, 'ok' | 'neutral' | 'warn' | 'danger'> = {
  vigente: 'ok',
  usada: 'neutral',
  vencida: 'danger',
  cancelada: 'danger',
  suspendida: 'warn',
};

/** Rótulo tolerante para textos armados en servicios, donde el valor llega como `string`. */
export function etiquetaTipoVisita(valor: string): string {
  return VISIT_TYPE_LABEL[valor as VisitType] ?? valor;
}
