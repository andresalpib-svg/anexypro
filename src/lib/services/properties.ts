import { withTenantContext } from '@/lib/db';
import { buscarPersonaExistente, camposQueFaltan } from '@/lib/services/person-identity';
import type { PropertyInput } from '@/lib/validations/property';

export async function listPropertiesByCondo(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.property.findMany({
      where: { condominiumId },
      orderBy: { code: 'asc' },
      include: {
        members: {
          where: { endDate: null, role: 'propietario' },
          include: { person: { select: { fullName: true } } },
          take: 1,
        },
      },
    })
  );
}

export async function getProperty(companyId: string, id: string) {
  return withTenantContext(companyId, (tx) =>
    tx.property.findFirst({
      where: { id },
      include: {
        condominium: { select: { id: true, name: true, code: true, currency: true } },
        members: { where: { endDate: null }, include: { person: true } },
        vehicles: true,
        pets: true,
        emergencyContacts: true,
      },
    })
  );
}

/**
 * Alta masiva de unidades al crear el condominio: "CASA-1".."CASA-N"
 * (con cero de relleno según la cantidad). skipDuplicates permite
 * re-ejecutar sin duplicar si ya existían códigos iguales.
 */
export async function bulkCreateProperties(
  companyId: string,
  condominiumId: string,
  count: number,
  propertyType: 'casa' | 'apartamento' = 'casa'
) {
  const digits = String(count).length;
  const prefix = propertyType === 'casa' ? 'CASA' : 'APTO';
  const data = Array.from({ length: count }, (_, i) => ({
    condominiumId,
    code: `${prefix}-${String(i + 1).padStart(digits, '0')}`,
    propertyType,
  }));
  return withTenantContext(companyId, (tx) => tx.property.createMany({ data, skipDuplicates: true }));
}

export async function createProperty(companyId: string, input: PropertyInput) {
  return withTenantContext(companyId, (tx) =>
    tx.property.create({
      data: {
        condominiumId: input.condominiumId,
        code: input.code.toUpperCase(),
        propertyType: input.propertyType,
        floor: input.floor ?? null,
        areaM2: input.areaM2 ?? null,
        parkingSpaces: input.parkingSpaces,
      },
    })
  );
}

// ---------- Residentes: personas, vínculos, vehículos, mascotas ----------
// Las bajas NUNCA se borran: se cierra endDate, preservando el
// historial completo de la unidad (inquilinos pasados, traspasos) —
// misma regla que ya validamos en el prototipo.

/**
 * Agrega a una persona a una unidad.
 *
 * Si esa persona YA está registrada en la empresa —misma cédula o mismo
 * correo—, no se crea una ficha nueva: se le vincula la unidad. Es el
 * caso de quien tiene propiedad en dos condominios distintos; con una
 * ficha por condominio quedarían dos estados de cuenta y dos intentos
 * de cuenta con el mismo correo. Ver `person-identity.ts`.
 */
export async function addPersonToProperty(
  companyId: string,
  propertyId: string,
  input: { fullName: string; idNumber?: string; email?: string; phone?: string; role: string; isPrimary?: boolean }
) {
  const result = await withTenantContext(companyId, async (tx) => {
    // Se necesita el condominio para ubicar la carpeta del residente.
    const property = await tx.property.findUniqueOrThrow({
      where: { id: propertyId },
      select: { condominiumId: true },
    });

    const existente = await buscarPersonaExistente(tx, companyId, input);
    let person = existente;
    let reutilizada = false;

    if (person) {
      reutilizada = true;
      const faltantes = camposQueFaltan(person, input);
      if (Object.keys(faltantes).length > 0) {
        person = await tx.person.update({ where: { id: person.id }, data: faltantes });
      }
    } else {
      person = await tx.person.create({
        data: {
          companyId,
          fullName: input.fullName,
          idNumber: input.idNumber || null,
          email: input.email || null,
          phone: input.phone || null,
        },
      });
    }

    // Re-agregar a la MISMA unidad no crea un segundo vínculo vigente.
    const vinculoVigente = await tx.propertyMember.findFirst({
      where: { propertyId, personId: person!.id, endDate: null },
    });
    if (!vinculoVigente) {
      await tx.propertyMember.create({
        data: {
          propertyId,
          personId: person!.id,
          role: input.role as any,
          isPrimary: input.isPrimary ?? false,
        },
      });
      await tx.propertyEvent.create({
        data: {
          propertyId,
          eventType: 'nuevo_miembro',
          description: reutilizada
            ? `${person!.fullName} —ya registrado en la empresa— se vinculó como ${input.role}.`
            : `${input.fullName} se registró como ${input.role}.`,
        },
      });
    }
    return { person: person!, condominiumId: property.condominiumId, reutilizada };
  });

  // Repositorio: carpeta individual del residente.
  //
  // Fuera de la transacción y sin propagar el error: un problema del
  // proveedor de almacenamiento no debe impedir registrar a una
  // persona. `ensureResidentFolder` es idempotente, así que la carpeta
  // se crea después con solo volver a abrir el repositorio.
  try {
    const { ensureResidentFolder } = await import('@/lib/services/storage');
    await ensureResidentFolder(companyId, result.condominiumId, result.person.id);
  } catch (e) {
    console.error(`[storage] No se pudo crear la carpeta de "${input.fullName}".`, e);
  }

  // `reutilizada` viaja con la persona para que la pantalla pueda
  // decirlo: "ya existía y se le asignó esta unidad" no es lo mismo que
  // "se creó".
  return Object.assign(result.person, { reutilizada: result.reutilizada });
}

export async function removePropertyMember(companyId: string, memberId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.propertyMember.update({ where: { id: memberId }, data: { endDate: new Date() } })
  );
}

export async function updatePerson(
  companyId: string,
  personId: string,
  input: { fullName: string; idNumber?: string; email?: string; phone?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.person.update({
      where: { id: personId },
      data: {
        fullName: input.fullName,
        idNumber: input.idNumber || null,
        email: input.email || null,
        phone: input.phone || null,
      },
    })
  );
}

export async function addVehicle(
  companyId: string,
  propertyId: string,
  input: { plate: string; brand?: string; model?: string; color?: string; vehicleType: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.vehicle.create({
      data: {
        propertyId,
        plate: input.plate.toUpperCase(),
        brand: input.brand || null,
        model: input.model || null,
        color: input.color || null,
        vehicleType: input.vehicleType as any,
      },
    })
  );
}

export async function addPet(
  companyId: string,
  propertyId: string,
  input: { name: string; species: string; breed?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.pet.create({
      data: { propertyId, name: input.name, species: input.species as any, breed: input.breed || null },
    })
  );
}

export async function addEmergencyContact(
  companyId: string,
  propertyId: string,
  input: { name: string; phone: string; relationship?: string }
) {
  return withTenantContext(companyId, (tx) =>
    tx.emergencyContact.create({
      data: { propertyId, name: input.name, phone: input.phone, relationship: input.relationship || null },
    })
  );
}

// ---------- Directorio de residentes (vista compañía/condominio) ----------
export async function listResidentsByCondo(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.propertyMember.findMany({
      where: { endDate: null, property: { condominiumId } },
      include: { person: true, property: { select: { id: true, code: true } } },
      orderBy: { person: { fullName: 'asc' } },
    })
  );
}

/** Búsqueda de control de acceso: residentes, unidades o placas de vehículo. */
export async function searchAccess(companyId: string, condominiumId: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return { members: [], vehicles: [] };
  return withTenantContext(companyId, async (tx) => {
    const members = await tx.propertyMember.findMany({
      where: {
        endDate: null,
        property: { condominiumId },
        OR: [{ person: { fullName: { contains: q, mode: 'insensitive' } } }, { property: { code: { contains: q, mode: 'insensitive' } } }],
      },
      include: { person: true, property: { select: { code: true } } },
      take: 20,
    });
    const vehicles = await tx.vehicle.findMany({
      where: { property: { condominiumId }, plate: { contains: q, mode: 'insensitive' } },
      include: { property: { select: { code: true } } },
      take: 20,
    });
    return { members, vehicles };
  });
}
