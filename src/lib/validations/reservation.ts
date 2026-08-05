import { z } from 'zod';
import { fechaISO, horaHHMM } from './comunes';

export const amenitySchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  capacity: z.coerce.number().int().positive().optional(),
  reservationCost: z.coerce.number().min(0).default(0),
  requiresApproval: z.coerce.boolean().default(false),
});

export const reservationSchema = z
  .object({
    condominiumId: z.string().uuid(),
    amenityId: z.string().uuid('Selecciona un área'),
    propertyId: z.string().uuid('Selecciona una unidad'),
    resDate: fechaISO,
    startsAt: horaHHMM,
    endsAt: horaHHMM,
  })
  // La detección de solapamiento compara las horas como texto
  // ("14:00" < "16:00"). Con un rango invertido —23:00 a 01:00— la
  // comparación no encuentra nunca conflicto y se podían crear dos
  // reservas encima de la misma franja.
  .refine((d) => d.endsAt > d.startsAt, {
    message: 'La hora de fin debe ser posterior a la de inicio',
    path: ['endsAt'],
  });
