import { withTenantContext } from '@/lib/db';
import { getPropertySuspension } from '@/lib/services/finance';

export async function listReservations(companyId: string, condominiumId: string) {
  return withTenantContext(companyId, (tx) =>
    tx.reservation.findMany({
      where: { condominiumId },
      orderBy: { resDate: 'desc' },
      include: { amenity: true, property: { select: { code: true } } },
    })
  );
}

/**
 * Choque de reservas. Toda reserva VIGENTE bloquea —tanto la ya
 * aprobada (confirmada) como la que aún espera aprobación—:
 *
 *  - exclusivePerDay = true  → el área queda tomada TODO EL DÍA.
 *  - exclusivePerDay = false → solo se bloquean las horas que se
 *    traslapan (misma regla que el EXCLUDE USING gist de la base,
 *    que sigue siendo la última defensa).
 */
async function findConflict(
  tx: any,
  amenityId: string,
  resDate: Date,
  startsAt: string,
  endsAt: string,
  exclusivePerDay: boolean
): Promise<{ startsAt: string; endsAt: string; status: string } | null> {
  const existing = await tx.reservation.findMany({
    where: {
      amenityId,
      resDate,
      status: { in: ['pendiente_aprobacion', 'confirmada'] },
    },
    select: { startsAt: true, endsAt: true, status: true },
  });
  if (exclusivePerDay) return existing[0] ?? null;
  return existing.find((r: { startsAt: string; endsAt: string }) => startsAt < r.endsAt && endsAt > r.startsAt) ?? null;
}

export async function createReservation(
  companyId: string,
  input: {
    condominiumId: string;
    amenityId: string;
    propertyId: string;
    resDate: Date;
    startsAt: string;
    endsAt: string;
    receiptUrl?: string;
    /** true en el portal del residente: un área con costo exige comprobante para solicitar. */
    requireReceiptIfCost?: boolean;
  }
) {
  // Ninguna unidad puede reservar sin que el sistema haya evaluado la
  // suspensión de servicios — se bloquea ANTES de tocar la base.
  const suspension = await getPropertySuspension(companyId, input.propertyId);
  if (suspension.suspended) {
    throw new Error(
      `Esta unidad tiene los servicios condominales suspendidos por ${suspension.monthsOverdue} meses de atraso — no puede reservar áreas comunes hasta ponerse al día.`
    );
  }

  return withTenantContext(companyId, async (tx) => {
    const amenity = await tx.amenity.findUniqueOrThrow({
      where: { id: input.amenityId },
      include: { schedules: true },
    });
    const hasCost = Number(amenity.reservationCost) > 0;

    // Horario de uso por bloques: si el área tiene bloques definidos,
    // la reserva debe caer completa dentro de un bloque de ese día.
    if (amenity.schedules.length > 0) {
      // resDate viene de "YYYY-MM-DD" (medianoche UTC) — el día de la
      // semana correcto es el UTC, no el local.
      const dayOfWeek = input.resDate.getUTCDay();
      const dayBlocks = amenity.schedules.filter((b) => b.dayOfWeek === dayOfWeek);
      const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      if (dayBlocks.length === 0) {
        throw new Error(`${amenity.name} no abre los ${DAYS[dayOfWeek]} — revisa el horario de uso del área.`);
      }
      const fits = dayBlocks.some((b) => input.startsAt >= b.opensAt && input.endsAt <= b.closesAt);
      if (!fits) {
        const horario = dayBlocks.map((b) => `${b.opensAt}–${b.closesAt}`).join(', ');
        throw new Error(`El horario de ${amenity.name} los ${DAYS[dayOfWeek]} es ${horario} — ajusta tu reserva a ese bloque.`);
      }
    }

    if (hasCost && input.requireReceiptIfCost && !input.receiptUrl) {
      throw new Error('Esta área tiene costo de reserva — adjunta el comprobante de pago para enviar la solicitud.');
    }

    const conflict = await findConflict(
      tx,
      input.amenityId,
      input.resDate,
      input.startsAt,
      input.endsAt,
      amenity.exclusivePerDay
    );
    if (conflict) {
      const fecha = input.resDate.toLocaleDateString('es-CR', { timeZone: 'UTC' });
      const estado = conflict.status === 'confirmada' ? 'ya aprobada' : 'pendiente de aprobación';
      throw new Error(
        amenity.exclusivePerDay
          ? `${amenity.name} ya está reservada el ${fecha} (reserva ${estado} de ${conflict.startsAt} a ${conflict.endsAt}). Esta área se reserva por día completo — elige otra fecha.`
          : `Ya existe una reserva ${estado} para ${amenity.name} el ${fecha} entre ${conflict.startsAt} y ${conflict.endsAt}.`
      );
    }

    return tx.reservation.create({
      data: {
        condominiumId: input.condominiumId,
        amenityId: input.amenityId,
        propertyId: input.propertyId,
        resDate: input.resDate,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        cost: amenity.reservationCost,
        receiptUrl: input.receiptUrl ?? null,
        // Una reserva con costo sin comprobante nunca puede nacer
        // "confirmada": el trigger de la base la rechazaría.
        status:
          amenity.requiresApproval || (hasCost && !input.receiptUrl) ? 'pendiente_aprobacion' : 'confirmada',
      },
    });
  });
}

/**
 * Una reserva con costo SOLO puede confirmarse con comprobante
 * adjunto — misma regla que enforce_reservation_receipt() en
 * prisma/sql/01_views_functions_triggers.sql (esa es la última
 * defensa; esta es la validación con mensaje legible en la app).
 */
export async function decideReservation(
  companyId: string,
  userId: string,
  input: { reservationId: string; decision: 'confirmada' | 'rechazada'; receiptUrl?: string }
) {
  return withTenantContext(companyId, async (tx) => {
    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id: input.reservationId },
      include: { amenity: true },
    });

    if (
      input.decision === 'confirmada' &&
      Number(reservation.amenity.reservationCost) > 0 &&
      !input.receiptUrl &&
      !reservation.receiptUrl
    ) {
      throw new Error('No es posible confirmar una reserva con costo sin comprobante de pago adjunto.');
    }

    return tx.reservation.update({
      where: { id: input.reservationId },
      data: {
        status: input.decision,
        decidedById: userId,
        decidedAt: new Date(),
        receiptUrl: input.receiptUrl || reservation.receiptUrl,
      },
    });
  });
}
