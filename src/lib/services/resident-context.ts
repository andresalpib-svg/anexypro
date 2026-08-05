import { cache } from 'react';
import { prisma, withTenantContext } from '@/lib/db';

/**
 * Resuelve la propiedad "activa" del residente autenticado: su
 * membresía vigente más relevante (propietario primero, si tiene
 * varias). Una persona con unidades en varios condominios de la misma
 * empresa usa UNA sola cuenta (ver migración 03) — esta primera
 * pasada resuelve siempre la primera encontrada; elegir entre varias
 * unidades es una mejora de una próxima pasada, documentada aquí.
 *
 * Envuelto en cache() de React: el layout y cada página del portal lo
 * llaman de forma independiente, pero dentro de un mismo request se
 * resuelve una sola vez.
 */
export const getResidentContext = cache(async (userId: string) => {
  // `users` no lleva RLS; `persons` sí. La empresa se toma del usuario
  // para poder abrir el contexto con el que se lee su ficha.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { companyId: true } });
  if (!user) return null;

  const person = await withTenantContext(user.companyId, (tx) =>
    tx.person.findUnique({
      where: { userId },
      include: {
        memberships: {
          where: { endDate: null },
          orderBy: { role: 'asc' }, // los enums de Postgres ordenan por su posición de declaración, no alfabéticamente — 'propietario' se declaró primero en PropertyRole (ver schema.prisma), así que ordena antes que el resto
          include: { property: { include: { condominium: true } } },
          take: 1,
        },
      },
    })
  );
  const membership = person?.memberships[0];
  if (!person || !membership) return null;
  return {
    person,
    property: membership.property,
    condominium: membership.property.condominium,
    role: membership.role,
  };
});
