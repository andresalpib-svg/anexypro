import type { Prisma } from '@prisma/client';

/**
 * Identidad de una persona dentro de la empresa administradora.
 *
 * POR QUÉ EXISTE: `Person` cuelga de la EMPRESA, no del condominio, y
 * `PropertyMember` la vincula a cada unidad. El modelo ya soportaba que
 * alguien tuviera propiedades en dos condominios distintos; lo que no
 * existía era el paso de RECONOCERLO. Al agregar a la misma persona en
 * el segundo condominio se creaba una ficha nueva, y con ella un
 * segundo intento de cuenta con el mismo correo — que la base rechaza,
 * porque el correo es único por empresa.
 *
 * El resultado para quien administra era este: "ya existe una cuenta
 * con ese correo", sin decir de quién ni cómo seguir. Lo correcto es lo
 * que pidió Freddy: si la persona ya está creada, no se duplica; se
 * detecta y se le asigna la unidad nueva.
 *
 * CRITERIO DE IDENTIDAD, en este orden:
 *   1. La cédula, comparada SOLO POR DÍGITOS — "1-0234-0567",
 *      "102340567" y "1 0234 0567" son la misma persona, y cada quien
 *      la escribe a su manera.
 *   2. El correo, sin distinguir mayúsculas.
 *
 * El nombre NO entra: dos personas distintas se llaman igual con
 * frecuencia, y unir sus fichas mezclaría estados de cuenta.
 */

/** Deja solo los dígitos de una cédula; vacío si no queda ninguno. */
export function soloDigitos(valor?: string | null): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** Correo comparable: sin espacios y en minúscula. */
export function correoNormalizado(valor?: string | null): string {
  return (valor ?? '').trim().toLowerCase();
}

export type IdentidadPersona = {
  idNumber?: string | null;
  email?: string | null;
};

/**
 * Busca a la persona ya registrada en la empresa. Devuelve `null` si no
 * hay con qué identificarla (sin cédula ni correo) o si no existe.
 *
 * Se ejecuta DENTRO del contexto de tenant de quien llama, así que RLS
 * ya limita la búsqueda a la empresa; el `companyId` explícito es la
 * segunda barrera, no la única.
 */
export async function buscarPersonaExistente(
  tx: Prisma.TransactionClient,
  companyId: string,
  identidad: IdentidadPersona
) {
  const cedula = soloDigitos(identidad.idNumber);
  const correo = correoNormalizado(identidad.email);

  // Por cédula. La comparación por dígitos necesita normalizar la
  // columna, y eso Prisma no lo expresa en un `where`: va en SQL. Se
  // piden solo los ids y la ficha completa se lee después con Prisma,
  // para no duplicar el mapeo de columnas a mano.
  if (cedula.length >= 5) {
    const filas = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM persons
      WHERE company_id = ${companyId}
        AND id_number IS NOT NULL
        AND regexp_replace(id_number, '[^0-9]', '', 'g') = ${cedula}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const id = filas[0]?.id;
    if (id) return tx.person.findUnique({ where: { id } });
  }

  if (correo) {
    return tx.person.findFirst({
      where: { companyId, email: { equals: correo, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  return null;
}

/**
 * Completa los datos que la ficha existente no tenía.
 *
 * Nunca PISA un dato ya registrado: si la ficha dice un teléfono y la
 * nueva unidad trae otro, gana el que ya estaba — corregirlo es una
 * decisión de quien administra, no un efecto secundario de asignar una
 * propiedad.
 */
export function camposQueFaltan(
  actual: { idNumber: string | null; email: string | null; phone: string | null },
  entrantes: { idNumber?: string | null; email?: string | null; phone?: string | null }
) {
  const datos: { idNumber?: string; email?: string; phone?: string } = {};
  if (!actual.idNumber && entrantes.idNumber) datos.idNumber = entrantes.idNumber;
  if (!actual.email && entrantes.email) datos.email = entrantes.email;
  if (!actual.phone && entrantes.phone) datos.phone = entrantes.phone;
  return datos;
}
