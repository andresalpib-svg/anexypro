/**
 * Extensión de Prisma que cifra/descifra en el borde de la base de
 * datos los campos bancarios sensibles, sin tocar cada `action`/
 * `service` que los lee o escribe.
 *
 * ALCANCE: solo `BankAccount.accountNumber`, `BankAccount.iban` y
 * `Supplier.bankAccount`. Se comprobó (grep en todo `src/`) que ninguno
 * de los dos modelos se lee nunca a través de un `include` anidado desde
 * otro modelo — siempre es `tx.bankAccount.…`/`tx.supplier.…` directo—,
 * así que interceptar sus operaciones de nivel superior cubre TODOS los
 * caminos de lectura/escritura reales. Si el día de mañana algo empieza
 * a incluir `bankAccounts` o `supplier.bankAccount` desde otro modelo,
 * ese resultado saldría cifrado sin pasar por acá: revisar este comentario
 * antes de agregar un `include` así.
 *
 * `createMany`/`updateMany` NO están cubiertos a propósito: ningún
 * lugar del código los usa hoy para estos dos modelos (grep también
 * comprobado). Si se llegaran a necesitar, agregar sus propios hooks
 * aquí — cifrar dentro de un `createMany` con SQL en lote es más caro
 * y hay que decidir si vale la pena.
 */
import type { Prisma } from '@prisma/client';
import { encryptField, decryptField } from './field-encryption';

function cifrarEntrada<T extends Record<string, unknown>>(data: T, campos: readonly string[]): T {
  const salida: Record<string, unknown> = { ...data };
  for (const campo of campos) {
    if (typeof salida[campo] === 'string') salida[campo] = encryptField(salida[campo] as string);
  }
  return salida as T;
}

function descifrarSalida<T>(registro: T, campos: readonly string[]): T {
  if (!registro || typeof registro !== 'object') return registro;
  const objeto = registro as Record<string, unknown>;
  for (const campo of campos) {
    if (typeof objeto[campo] === 'string') objeto[campo] = decryptField(objeto[campo] as string);
  }
  return registro;
}

/** Fábrica genérica: un modelo + sus campos sensibles → los hooks de Prisma. */
function hooksDeCifrado(campos: readonly string[]) {
  return {
    async create({ args, query }: any) {
      if (args.data) args.data = cifrarEntrada(args.data, campos);
      return descifrarSalida(await query(args), campos);
    },
    async update({ args, query }: any) {
      if (args.data) args.data = cifrarEntrada(args.data, campos);
      return descifrarSalida(await query(args), campos);
    },
    async upsert({ args, query }: any) {
      if (args.create) args.create = cifrarEntrada(args.create, campos);
      if (args.update) args.update = cifrarEntrada(args.update, campos);
      return descifrarSalida(await query(args), campos);
    },
    async findUnique({ args, query }: any) {
      return descifrarSalida(await query(args), campos);
    },
    async findUniqueOrThrow({ args, query }: any) {
      return descifrarSalida(await query(args), campos);
    },
    async findFirst({ args, query }: any) {
      return descifrarSalida(await query(args), campos);
    },
    async findFirstOrThrow({ args, query }: any) {
      return descifrarSalida(await query(args), campos);
    },
    async findMany({ args, query }: any) {
      const resultado = await query(args);
      return Array.isArray(resultado) ? resultado.map((r: unknown) => descifrarSalida(r, campos)) : resultado;
    },
  };
}

const CAMPOS_BANK_ACCOUNT = ['accountNumber', 'iban'] as const;
const CAMPOS_SUPPLIER = ['bankAccount'] as const;

export function conCifradoDeCamposSensibles<C extends { $extends: (...a: any[]) => any }>(cliente: C) {
  return cliente.$extends({
    name: 'cifrado-campos-bancarios',
    query: {
      bankAccount: hooksDeCifrado(CAMPOS_BANK_ACCOUNT),
      supplier: hooksDeCifrado(CAMPOS_SUPPLIER),
    },
  }) as C;
}

export type { Prisma };
