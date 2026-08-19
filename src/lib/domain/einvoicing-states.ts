/**
 * Los dos ciclos de vida de la facturación electrónica: el del MÓDULO
 * en un condominio, y el de un COMPROBANTE.
 *
 * Son estados de ANEXYpro, no de Hacienda: acá no se codifica ninguna
 * estructura tributaria. Por eso se pueden escribir y probar hoy, con
 * el módulo apagado, y por eso son lo primero que hay que tener listo
 * — el día de la implementación las transiciones ya están decididas y
 * probadas, y la discusión se limita a la estructura oficial.
 */

// ============================================================
// 1. Activación del módulo en un condominio
// ============================================================

export type EstadoModulo = 'inactivo' | 'configurado' | 'validado' | 'probado' | 'activo' | 'suspendido';

/**
 * El flujo que pide la etapa:
 *
 *   Configuración fiscal → Validación → Prueba de conexión →
 *   Confirmación → Activación
 *
 * Es lineal a propósito: no se puede activar sin haber probado la
 * conexión, y no se puede probar sin haber validado los datos. Saltarse
 * un paso es cómo se termina emitiendo con una cédula mal digitada.
 *
 * `suspendido` es la única salida lateral: se llega desde `activo` y se
 * vuelve a `activo` sin repetir todo el camino (un certificado vencido
 * se renueva, no obliga a reconfigurar el condominio).
 */
const TRANSICIONES_MODULO: Record<EstadoModulo, EstadoModulo[]> = {
  inactivo: ['configurado'],
  // Se puede volver a editar la configuración: eso devuelve a
  // `configurado` y obliga a validar de nuevo. Cambiar la cédula y
  // seguir "validado" sería mentira.
  configurado: ['configurado', 'validado'],
  validado: ['configurado', 'probado'],
  probado: ['configurado', 'activo'],
  activo: ['suspendido'],
  suspendido: ['activo', 'configurado'],
};

export function puedeTransicionarModulo(desde: EstadoModulo, hacia: EstadoModulo): boolean {
  return TRANSICIONES_MODULO[desde]?.includes(hacia) ?? false;
}

/** El paso siguiente del flujo, para que la pantalla diga qué falta. */
export const SIGUIENTE_PASO: Record<EstadoModulo, string | null> = {
  inactivo: 'Cargar la configuración fiscal del condominio',
  configurado: 'Validar los datos fiscales',
  validado: 'Probar la conexión contra el ambiente de pruebas',
  probado: 'Confirmar y activar',
  activo: null,
  suspendido: 'Reactivar cuando se resuelva el motivo de la suspensión',
};

/**
 * ¿Este condominio puede emitir?
 *
 * Es la pregunta que tiene que hacerse CUALQUIER código futuro antes de
 * emitir, y hoy devuelve `false` para todos los condominios porque
 * todos están en `inactivo`. Deliberadamente exige también el
 * ambiente: estar `activo` en `pruebas` no habilita a emitir de verdad.
 */
export function puedeEmitir(estado: EstadoModulo, ambiente: 'pruebas' | 'produccion'): boolean {
  return estado === 'activo' && ambiente === 'produccion';
}

// ============================================================
// 2. Ciclo de vida de un comprobante
// ============================================================

export type EstadoComprobante =
  | 'borrador'
  | 'generado'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'anulado'
  | 'error';

/**
 * Las transiciones que la normativa y la realidad permiten:
 *
 *  · borrador  — todavía es nuestro, se puede editar y descartar.
 *  · generado  — ya tiene clave y consecutivo. Desde acá NO se edita.
 *  · enviado   — salió hacia Hacienda o el proveedor.
 *  · aceptado  — respuesta conforme. Es el único estado final "bueno".
 *  · rechazado — respuesta disconforme. NO se corrige el documento: se
 *                emite otro. Por eso rechazado no vuelve a borrador.
 *  · error     — falló la comunicación, no la validación fiscal. Es el
 *                único estado del que se puede REINTENTAR, porque el
 *                comprobante en sí sigue siendo válido.
 *  · anulado   — se anuló con una nota de crédito que lo referencia.
 *
 * Un `aceptado` NO puede pasar a `rechazado` ni al revés: Hacienda ya
 * se pronunció. Y ningún estado vuelve a `borrador` — es lo que impide
 * maquillar el historial, y además lo refuerza un disparador en la base
 * (`prisma/sql/07_facturacion_electronica.sql`).
 */
const TRANSICIONES_COMPROBANTE: Record<EstadoComprobante, EstadoComprobante[]> = {
  borrador: ['generado', 'anulado'],
  generado: ['enviado', 'error', 'anulado'],
  enviado: ['aceptado', 'rechazado', 'error'],
  aceptado: ['anulado'],
  // Un rechazo es definitivo para ESE comprobante: se emite uno nuevo.
  rechazado: [],
  error: ['enviado', 'anulado'],
  anulado: [],
};

export function puedeTransicionarComprobante(desde: EstadoComprobante, hacia: EstadoComprobante): boolean {
  return TRANSICIONES_COMPROBANTE[desde]?.includes(hacia) ?? false;
}

/** Estados desde los que ya no se mueve nada. */
export function esEstadoFinal(estado: EstadoComprobante): boolean {
  return TRANSICIONES_COMPROBANTE[estado]?.length === 0;
}

/**
 * ¿Este comprobante todavía se puede editar?
 *
 * Solo en borrador. Es la regla que impide "arreglar" un comprobante
 * emitido en vez de emitir la nota de crédito que corresponde.
 */
export function esEditable(estado: EstadoComprobante): boolean {
  return estado === 'borrador';
}

/**
 * ¿Este comprobante necesita una nota de crédito o débito para
 * corregirse? Todo lo que salió de borrador y no fue rechazado.
 */
export function requiereNotaParaCorregir(estado: EstadoComprobante): boolean {
  return estado === 'generado' || estado === 'enviado' || estado === 'aceptado';
}

export const ESTADO_COMPROBANTE_LABEL: Record<EstadoComprobante, string> = {
  borrador: 'Borrador',
  generado: 'Generado',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
  error: 'Error de comunicación',
};

export const ESTADO_MODULO_LABEL: Record<EstadoModulo, string> = {
  inactivo: 'Inactivo',
  configurado: 'Configurado, sin validar',
  validado: 'Datos validados',
  probado: 'Conexión probada',
  activo: 'Activo',
  suspendido: 'Suspendido',
};
