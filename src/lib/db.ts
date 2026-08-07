import { PrismaClient, Prisma } from '@prisma/client';

// Singleton estándar de Next.js para evitar agotar el pool de
// conexiones con cada hot-reload en desarrollo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Ejecuta `fn` dentro de una transacción con el contexto de tenant
 * (app.current_company_id) establecido para Row-Level Security — ver
 * prisma/sql/02_row_level_security.sql y 03_rls_endurecido.sql.
 *
 * **Ya no es una recomendación.** Desde que RLS está forzado y la
 * aplicación se conecta con un rol sin privilegios, una consulta a una
 * tabla de datos de cliente hecha fuera de aquí no devuelve una lista
 * vacía: **falla**, porque las políticas leen un parámetro que solo
 * existe dentro de esta transacción. Eso es deliberado — un olvido se
 * nota de inmediato en vez de pasar por dato ausente.
 *
 * companyId debe venir de la sesión autenticada (auth()), nunca de
 * un parámetro de la URL o del body sin validar contra la sesión.
 *
 * Usa Prisma.TransactionClient (el tipo oficial del cliente de
 * transacción), no un Omit hecho a mano — así cualquier función de
 * src/lib/services/*.ts que reciba `tx` como parámetro (por ejemplo,
 * accounting.ts) es compatible sin fricciones de tipos.
 */
export type OpcionesTransaccion = {
  /** Milisegundos que puede durar la transacción. Prisma da 5000 por omisión. */
  timeout?: number;
  /** Milisegundos esperando una conexión libre del pool. */
  maxWait?: number;
};

/**
 * `opciones` existe por una avería concreta: **el plazo de Prisma son 5
 * segundos**, y eso alcanza de sobra en la máquina de desarrollo —donde
 * la base está en localhost— pero no contra una base remota. La
 * importación de residentes hace cientos de consultas dentro de una sola
 * transacción; con 95 filiales contra Supabase se pasó del plazo y
 * Postgres revirtió la carga entera con un error incomprensible
 * ("Transaction not found... refers to an old closed transaction").
 *
 * Es la clase de fallo que solo aparece en producción, así que las
 * operaciones EN LOTE tienen que pedir su propio plazo. Las demás se
 * quedan con el de Prisma a propósito: una transacción larga retiene la
 * conexión, y volverlo el valor por omisión escondería consultas lentas
 * en vez de arreglarlas.
 */
export async function withTenantContext<T>(
  companyId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opciones?: OpcionesTransaccion
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_company_id', $1, true)`, companyId);
      return fn(tx);
    },
    opciones
  );
}

/**
 * Recorre TODAS las empresas, abriendo el contexto de cada una.
 *
 * Es la vía para lo que legítimamente atraviesa empresas: el
 * programador de tareas, que corre sin sesión, y el panel del usuario
 * master, que mira la plataforma entera. No hay una puerta trasera que
 * apague RLS: se entra empresa por empresa, con su contexto, y cada
 * consulta sigue viendo únicamente lo suyo.
 *
 * `companies` no tiene RLS —el inicio de sesión la necesita antes de
 * saber a qué empresa pertenece nadie—, así que la lista se puede leer
 * de frente.
 */
export async function forEachCompany<T>(
  fn: (tx: Prisma.TransactionClient, companyId: string) => Promise<T>
): Promise<{ companyId: string; result: T }[]> {
  const companies = await prisma.company.findMany({ select: { id: true } });
  const out: { companyId: string; result: T }[] = [];
  for (const c of companies) {
    out.push({ companyId: c.id, result: await withTenantContext(c.id, (tx) => fn(tx, c.id)) });
  }
  return out;
}
