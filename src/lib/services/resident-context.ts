import { cache } from 'react';
import { cookies } from 'next/headers';
import { prisma, withTenantContext } from '@/lib/db';

/** Unidad activa del residente — misma idea que el Condominio Activo del panel. */
export const ACTIVE_UNIT_COOKIE = 'anexypro-unidad-activa';

/**
 * Resuelve la propiedad "activa" del residente autenticado.
 *
 * UNA PERSONA, UNA CUENTA, VARIAS UNIDADES: quien tiene propiedad en
 * dos condominios de la misma administradora entra con un solo usuario
 * (ver `person-identity.ts`, que impide duplicar la ficha) y elige
 * desde cuál está mirando el portal. La elección vive en una cookie,
 * igual que el Condominio Activo del panel, y solo se respeta si esa
 * unidad es realmente suya — nunca puede apuntar a la de otro.
 *
 * Si no hay cookie o ya no vale, gana la primera membresía: propietario
 * antes que inquilino o residente.
 *
 * El resto del portal sigue leyendo `property` y `condominium` como
 * siempre; lo único nuevo es `units`, para dibujar el selector.
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
        },
      },
    })
  );
  if (!person || person.memberships.length === 0) return null;

  const elegida = cookies().get(ACTIVE_UNIT_COOKIE)?.value;
  const membership =
    person.memberships.find((m) => m.propertyId === elegida) ?? person.memberships[0]!;

  return {
    person,
    property: membership.property,
    condominium: membership.property.condominium,
    role: membership.role,
    /** Todas las unidades vigentes del residente, para el selector. */
    units: person.memberships.map((m) => ({
      propertyId: m.propertyId,
      code: m.property.code,
      role: m.role,
      condominiumId: m.property.condominiumId,
      condominiumName: m.property.condominium.name,
    })),
  };
});
