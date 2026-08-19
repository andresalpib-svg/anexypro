import type { EInvoicingKind, EInvoicingProvider } from './provider';

/**
 * Fábrica del proveedor de facturación electrónica.
 *
 * Es el ÚNICO lugar del sistema que sabrá qué adaptadores existen —
 * mismo diseño que `src/lib/storage/index.ts`, que ya se usa en
 * producción para elegir entre el disco local y Google Drive.
 *
 * **HOY NO HAY NINGUNO.** `IMPLEMENTADOS` está vacío a propósito y
 * `getProvider` siempre falla. Eso no es un descuido: es la garantía
 * de que esta etapa no activó nada. Si mañana alguien conecta un
 * servicio y se olvida de la configuración, el sistema no emite un
 * comprobante a medias — se niega con un mensaje claro.
 *
 * Agregar un proveedor el día que se implemente son tres líneas acá y
 * un archivo nuevo que implemente `EInvoicingProvider`. Ningún módulo
 * de Finanzas cambia.
 */

export const PROVIDER_LABEL: Record<EInvoicingKind, string> = {
  integracion_propia: 'Integración propia con Hacienda',
  proveedor_externo: 'Proveedor de facturación electrónica',
};

/** Adaptadores con implementación. Vacío: la Etapa 9 solo preparó la arquitectura. */
export const IMPLEMENTADOS: EInvoicingKind[] = [];

/** Error propio para poder distinguirlo de una falla real de emisión. */
export class FacturacionNoImplementada extends Error {
  constructor(detalle: string) {
    super(detalle);
    this.name = 'FacturacionNoImplementada';
  }
}

export function getProvider(kind: EInvoicingKind): EInvoicingProvider {
  if (!IMPLEMENTADOS.includes(kind)) {
    throw new FacturacionNoImplementada(
      `La facturación electrónica no está implementada (${PROVIDER_LABEL[kind] ?? kind}). ` +
        'La Etapa 9 solo dejó preparada la arquitectura: modelo de datos, estados, consecutivos y este contrato. ' +
        'La implementación debe hacerse contra la versión vigente de las estructuras oficiales de Hacienda.'
    );
  }
  // Inalcanzable mientras `IMPLEMENTADOS` esté vacío. Queda escrito
  // para que el día que se agregue un adaptador el sitio sea evidente.
  throw new FacturacionNoImplementada('Adaptador declarado pero no registrado en la fábrica.');
}

/** ¿Hay algún adaptador disponible? Lo usa la pantalla para no ofrecer lo que no existe. */
export function hayProveedorDisponible(): boolean {
  return IMPLEMENTADOS.length > 0;
}
