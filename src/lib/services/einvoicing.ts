import type { Prisma } from '@prisma/client';
import { withTenantContext } from '@/lib/db';
import { FacturacionNoImplementada } from '@/lib/einvoicing';
import { puedeEmitir, type EstadoModulo } from '@/lib/domain/einvoicing-states';

/**
 * Facturación electrónica — servicios de la PREPARACIÓN.
 *
 * Lo que hay acá se puede correr hoy sin que pase nada: leer la
 * configuración fiscal de un condominio (vacía en todos), repartir un
 * consecutivo, y una puerta que se niega a emitir.
 *
 * Lo que NO hay, a propósito: generar XML, firmar, transmitir, hablar
 * con Hacienda o con un proveedor. Ninguna función de este archivo la
 * llama ningún flujo de Finanzas.
 */

// ============================================================
// Configuración fiscal — por condominio, nunca compartida
// ============================================================

/**
 * Lee la configuración fiscal de UN condominio, creándola vacía la
 * primera vez.
 *
 * No hereda nada de la empresa administradora ni de otro condominio, y
 * no hay ninguna función que copie configuración entre condominios: son
 * contribuyentes distintos, con su propia cédula, su propia actividad y
 * su propia condición tributaria. Que dos condominios de la misma
 * administradora coincidan en algo es casualidad, no una regla.
 */
export async function getFiscalSettings(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.condominiumFiscalSettings.upsert({
      where: { condominiumId },
      create: { condominiumId },
      update: {},
    })
  );
}

/** Los campos que la configuración necesita para considerarse completa. */
const CAMPOS_OBLIGATORIOS = [
  'identificationTypeCode',
  'identificationNumber',
  'legalName',
  'economicActivityCode',
  'email',
  'provinceCode',
  'cantonCode',
  'districtCode',
  'taxConditionCode',
  'taxRegimeCode',
] as const;

export type FaltanteFiscal = (typeof CAMPOS_OBLIGATORIOS)[number];

/**
 * Validación de FORMA, el segundo paso del flujo de activación.
 *
 * Comprueba que estén todos los campos, NADA MÁS. No valida el formato
 * de la cédula ni que la actividad económica exista: eso exige los
 * catálogos oficiales, que hoy están vacíos a propósito
 * (`fiscal_catalog_entries`). El día de la implementación esta función
 * crece contra el catálogo cargado, sin cambiar quién la llama.
 */
export function camposFaltantes(settings: Record<string, unknown>): FaltanteFiscal[] {
  return CAMPOS_OBLIGATORIOS.filter((campo) => {
    const v = settings[campo];
    return v === null || v === undefined || v === '';
  });
}

// ============================================================
// Consecutivos
// ============================================================

/**
 * Entrega el siguiente consecutivo de un condominio para un tipo de
 * comprobante. Es la ÚNICA forma de obtener un número.
 *
 * Por qué un `UPDATE ... RETURNING` y no un `MAX + 1`: el resto del
 * sistema numera con `MAX + 1` (ver `nextExpenseNumber` en
 * `expenses.ts`) y ahí el peor caso es un consecutivo interno repetido,
 * molesto pero corregible. Acá el peor caso es dos comprobantes
 * FISCALES con el mismo número, que no se corrige: hay que anular y
 * volver a emitir, con Hacienda de por medio. `MAX + 1` lee y después
 * escribe; dos emisiones simultáneas leen el mismo valor. Esta
 * sentencia lee y escribe en una sola operación atómica, y Postgres
 * serializa las que compitan por la misma fila.
 *
 * El `ON CONFLICT` cubre el primer uso sin una consulta previa —que
 * reintroduciría la carrera que se quiere evitar.
 *
 * UN CONSECUTIVO DE UN CONDOMINIO JAMÁS SE USA EN OTRO: `condominiumId`
 * va en la clave única de la tabla y en esta sentencia. Ni un error de
 * programación futuro puede cruzarlos.
 */
export async function allocateConsecutive(
  tx: Prisma.TransactionClient,
  input: { condominiumId: string; documentType: string; branch?: string; terminal?: string }
): Promise<bigint> {
  const branch = input.branch ?? '001';
  const terminal = input.terminal ?? '00001';

  const filas = await tx.$queryRaw<{ last_number: bigint }[]>`
    INSERT INTO fiscal_sequences (id, condominium_id, document_type, branch, terminal, last_number, created_at, updated_at)
    VALUES (gen_random_uuid(), ${input.condominiumId}, ${input.documentType}, ${branch}, ${terminal}, 1, NOW(), NOW())
    ON CONFLICT (condominium_id, document_type, branch, terminal)
    DO UPDATE SET last_number = fiscal_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number
  `;
  const numero = filas[0]?.last_number;
  if (numero === undefined) throw new Error('No se pudo asignar el consecutivo.');
  return numero;
}

/**
 * El número consecutivo, a secas. **El FORMATO oficial no se arma acá.**
 *
 * La numeración de un comprobante electrónico se compone con sucursal,
 * terminal, tipo de comprobante y el consecutivo, en un largo y un
 * orden que define la especificación de Hacienda. Escribir aquí ese
 * armado sería codificar de memoria una estructura tributaria — lo que
 * esta etapa prohíbe explícitamente y, además, es la clase de detalle
 * que uno recuerda mal.
 *
 * Se deja el número crudo y sus componentes; el adaptador que se
 * escriba contra la especificación vigente los compone.
 */
export function componentesConsecutivo(input: {
  branch: string;
  terminal: string;
  documentType: string;
  numero: bigint;
}) {
  return {
    branch: input.branch,
    terminal: input.terminal,
    documentType: input.documentType,
    numero: input.numero.toString(),
  };
}

// ============================================================
// La puerta que hoy está cerrada
// ============================================================

/**
 * Comprueba que un condominio pueda emitir. **Hoy siempre falla**,
 * porque todos los condominios están en `inactivo` y porque no hay
 * ningún adaptador registrado.
 *
 * Existe ahora, apagada, para que el día de la implementación no haya
 * que acordarse de agregarla: cualquier código de emisión futuro tiene
 * que pasar por acá primero.
 */
export async function assertPuedeEmitir(companyId: string, condominiumId: string): Promise<never | void> {
  const settings = await getFiscalSettings(companyId, condominiumId);
  if (!puedeEmitir(settings.status as EstadoModulo, settings.environment)) {
    throw new FacturacionNoImplementada(
      `La facturación electrónica no está activa para este condominio (estado: ${settings.status}, ambiente: ${settings.environment}).`
    );
  }
  // Inalcanzable hoy: ningún condominio llega a `activo` porque no hay
  // flujo que lo mueva. Si algún día llegara sin adaptador, esto lo
  // detiene igual.
  throw new FacturacionNoImplementada(
    'No hay ningún proveedor de facturación electrónica implementado. Ver src/lib/einvoicing/index.ts.'
  );
}
