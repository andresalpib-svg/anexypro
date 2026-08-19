/**
 * Contrato de la facturación electrónica. **Ninguna implementación
 * existe todavía y ninguna se va a escribir en esta etapa.**
 *
 * ESTA ES LA ÚNICA PUERTA. Igual que con el repositorio de documentos
 * (`src/lib/storage/provider.ts`, mismo patrón ya probado en
 * producción), ningún módulo de Finanzas sabe —ni debe saber— si
 * detrás hay una integración propia contra Hacienda o un proveedor
 * autorizado. Finanzas habla con un servicio; el servicio habla con
 * esta interfaz.
 *
 * Consecuencia práctica, que es justo lo que pide la etapa: cambiar de
 * proveedor es escribir esta interfaz una vez más y cambiar la
 * configuración del condominio. No se toca una línea de Finanzas.
 *
 * ── POR QUÉ ESTA INTERFAZ NO HABLA DE XML ──
 *
 * Porque la estructura del comprobante es de Hacienda y cambia por
 * resolución. Si esta puerta recibiera un "objeto FacturaElectrónica"
 * con sus campos, estaríamos codificando de memoria una estructura
 * tributaria — exactamente lo que la etapa prohíbe — y cada cambio de
 * versión rompería el contrato.
 *
 * En su lugar la puerta recibe un ENCARGO en el vocabulario de
 * ANEXYpro (qué condominio, qué tipo de comprobante, a quién, por
 * cuánto) y devuelve identificadores OPACOS. Traducir ese encargo a la
 * estructura vigente es responsabilidad del adaptador, que se escribirá
 * leyendo la especificación oficial del momento.
 */

import type { FiscalDocumentStatus } from '@prisma/client';

export type EInvoicingKind = 'integracion_propia' | 'proveedor_externo';

/** Contra qué ambiente trabaja el adaptador. Nunca se asume producción. */
export type Environment = 'pruebas' | 'produccion';

/**
 * Datos fiscales del emisor. Todos los códigos de catálogo viajan como
 * `string` a propósito: su lista vive en `fiscal_catalog_entries` y se
 * carga de la especificación oficial, no de acá.
 */
export type EmitterProfile = {
  condominiumId: string;
  identificationTypeCode: string;
  identificationNumber: string;
  legalName: string;
  tradeName?: string | null;
  economicActivityCode: string;
  email?: string | null;
  phone?: string | null;
  provinceCode?: string | null;
  cantonCode?: string | null;
  districtCode?: string | null;
  addressLine?: string | null;
  taxConditionCode?: string | null;
  taxRegimeCode?: string | null;
};

/** A quién se le emite. Puede no haber receptor identificado (tiquete). */
export type ReceiverProfile = {
  identificationTypeCode?: string | null;
  identificationNumber?: string | null;
  name?: string | null;
  email?: string | null;
};

export type DocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Código del catálogo de bienes y servicios. Se resuelve al implementar. */
  itemCode?: string | null;
  /** Código de impuesto del catálogo oficial, si aplica. */
  taxCode?: string | null;
  taxRate?: number | null;
};

/**
 * El encargo de emitir. Nótese que NO lleva clave, ni consecutivo, ni
 * XML: eso lo produce el adaptador o el servicio de consecutivos, no
 * quien pide la emisión.
 */
export type IssueRequest = {
  documentTypeCode: string;
  environment: Environment;
  emitter: EmitterProfile;
  receiver?: ReceiverProfile | null;
  currency: string;
  lines: DocumentLine[];
  /** Nota de crédito/débito: a qué comprobante corrige y por qué. */
  reference?: {
    referencedClave: string;
    referenceCode: string;
    reason: string;
  } | null;
  /** De dónde nació, para poder reconciliar después. Opaco para el adaptador. */
  sourceTable?: string;
  sourceId?: string;
};

/**
 * Lo que devuelve el adaptador. Todo identificador es OPACO: ANEXYpro
 * lo guarda y lo devuelve, nunca lo interpreta ni lo construye. Por eso
 * funciona igual con una integración propia que con un proveedor.
 */
export type IssueResult = {
  clave: string;
  consecutive: string;
  status: FiscalDocumentStatus;
  providerDocumentRef?: string | null;
  /** Contenido de los XML. El servicio decide dónde guardarlos. */
  xmlGenerated?: Buffer | null;
  xmlSigned?: Buffer | null;
  responseCode?: string | null;
  responseMessage?: string | null;
  /** Versión de la estructura oficial con la que se construyó. */
  specVersion: string;
};

export type StatusResult = {
  status: FiscalDocumentStatus;
  responseCode?: string | null;
  responseMessage?: string | null;
  responseXml?: Buffer | null;
};

/** Resultado de la prueba de conexión del flujo de activación. */
export type ConnectionCheck = {
  ok: boolean;
  detail: string;
  /** Versión de la estructura oficial que reporta el proveedor. */
  specVersion?: string | null;
};

export interface EInvoicingProvider {
  readonly kind: EInvoicingKind;
  /**
   * Prueba de conexión. Es el ÚNICO método que el flujo de activación
   * puede llamar antes de activar, y no emite nada.
   */
  checkConnection(emitter: EmitterProfile, environment: Environment): Promise<ConnectionCheck>;
  /** Emite. No se llama desde ninguna parte todavía. */
  issue(request: IssueRequest): Promise<IssueResult>;
  /** Consulta el estado de un comprobante ya enviado. */
  fetchStatus(clave: string, environment: Environment): Promise<StatusResult>;
  /**
   * Anulación. En Costa Rica anular es emitir una nota de crédito que
   * referencia al original, no un "borrar" — por eso devuelve un
   * `IssueResult`: el resultado es OTRO comprobante.
   */
  voidDocument(clave: string, reason: string, environment: Environment): Promise<IssueResult>;
}
