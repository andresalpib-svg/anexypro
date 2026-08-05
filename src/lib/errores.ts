/**
 * Traduce una excepción a un mensaje que se le puede enseñar al usuario.
 *
 * POR QUÉ EXISTE: el patrón `e?.message ?? 'mensaje genérico'` está
 * repartido por unas sesenta acciones y devuelve al formulario el texto
 * crudo de Prisma o del proveedor de almacenamiento. A quien administra
 * un condominio, un "Invalid `prisma.charge.create()` invocation" no le
 * dice nada, y de paso enseña nombres de tablas y de columnas.
 *
 * Los errores de NEGOCIO sí se muestran: son los que el propio código
 * lanza con `new Error('...')` para explicar por qué no se puede hacer
 * algo ("El gasto supera el saldo de la caja chica"). Se distinguen
 * porque no traen `code` de Prisma ni pinta de error de infraestructura.
 */

/** Marcas inequívocas de un error técnico, no de negocio. */
const TECNICO = [
  'prisma',
  'invocation',
  'econnrefused',
  'etimedout',
  'enotfound',
  'socket',
  'connection',
  'timeout',
  'fetch failed',
  'database',
  'relation ',
  'column ',
  'constraint',
  'sqlstate',
];

export function mensajeDeError(e: unknown, generico: string): string {
  const bruto = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (!bruto) return generico;

  // Errores de Prisma: siempre genérico. Traen `code` (P2002, P2025…).
  if (typeof (e as any)?.code === 'string' && /^P\d{4}$/.test((e as any).code)) return generico;

  const bajo = bruto.toLowerCase();
  if (TECNICO.some((t) => bajo.includes(t))) return generico;

  // Un mensaje larguísimo o multilínea es casi siempre una traza.
  if (bruto.length > 220 || bruto.includes('\n')) return generico;

  return bruto;
}

/**
 * Igual que la anterior, pero además deja el error real en el registro
 * del servidor: sin esto, cambiar el mensaje visible haría más difícil
 * diagnosticar el problema, no más fácil.
 */
export function registrarYMensaje(e: unknown, generico: string, contexto: string): string {
  console.error(`[${contexto}]`, e);
  return mensajeDeError(e, generico);
}
