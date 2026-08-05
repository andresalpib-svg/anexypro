import { withTenantContext } from '@/lib/db';

export async function listAmenities(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.amenity.findMany({
      where: { condominiumId },
      orderBy: { name: 'asc' },
      include: { schedules: { orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }] } },
    })
  );
}

export async function createAmenity(
  companyId: string,
  input: {
    condominiumId: string;
    name: string;
    capacity?: number;
    reservationCost: number;
    requiresApproval: boolean;
    exclusivePerDay?: boolean;
    rulesUrl?: string;
    photoUrl?: string;
  }
) {
  return withTenantContext(companyId, (tx) =>
    tx.amenity.create({
      data: {
        condominiumId: input.condominiumId,
        name: input.name,
        capacity: input.capacity ?? null,
        reservationCost: input.reservationCost,
        requiresApproval: input.requiresApproval,
        exclusivePerDay: input.exclusivePerDay ?? true,
        rulesUrl: input.rulesUrl ?? null,
        photoUrl: input.photoUrl ?? null,
      },
    })
  );
}

export async function updateAmenity(
  companyId: string,
  amenityId: string,
  input: {
    name: string;
    capacity?: number;
    reservationCost: number;
    requiresApproval: boolean;
    exclusivePerDay: boolean;
    maxHours?: number;
    advanceDays?: number;
    rulesUrl?: string;
    photoUrl?: string;
    status?: string;
  }
) {
  return withTenantContext(companyId, (tx) =>
    tx.amenity.update({
      where: { id: amenityId },
      data: {
        name: input.name,
        capacity: input.capacity ?? null,
        reservationCost: input.reservationCost,
        requiresApproval: input.requiresApproval,
        exclusivePerDay: input.exclusivePerDay,
        maxHours: input.maxHours ?? null,
        ...(input.advanceDays !== undefined ? { advanceDays: input.advanceDays } : {}),
        ...(input.status ? { status: input.status as any } : {}),
        // Sin archivo nuevo, se conservan los actuales.
        ...(input.rulesUrl ? { rulesUrl: input.rulesUrl } : {}),
        ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
      },
    })
  );
}

export async function deleteAmenity(companyId: string, amenityId: string) {
  return withTenantContext(companyId, async (tx) => {
    const count = await tx.reservation.count({ where: { amenityId, status: { in: ['pendiente_aprobacion', 'confirmada'] } } });
    if (count > 0) {
      throw new Error(`Esta área tiene ${count} reserva(s) vigente(s) — resuélvelas antes de eliminarla, o márcala como no disponible.`);
    }
    return tx.amenity.delete({ where: { id: amenityId } });
  });
}

// ---------- Horario de uso por bloques (día + rango de horas) ----------
export async function addScheduleBlocks(
  companyId: string,
  amenityId: string,
  days: number[], // 0 = domingo … 6 = sábado
  opensAt: string,
  closesAt: string
) {
  if (closesAt <= opensAt) throw new Error('La hora de cierre debe ser mayor que la de apertura.');
  return withTenantContext(companyId, (tx) =>
    tx.amenitySchedule.createMany({
      data: days.map((dayOfWeek) => ({ amenityId, dayOfWeek, opensAt, closesAt })),
    })
  );
}

export async function deleteScheduleBlock(companyId: string, scheduleId: string) {
  return withTenantContext(companyId, (tx) => tx.amenitySchedule.delete({ where: { id: scheduleId } }));
}
