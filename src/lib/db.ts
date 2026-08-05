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
export async function withTenantContext<T>(
  companyId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_company_id', $1, true)`, companyId);
    return fn(tx);
  });
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
