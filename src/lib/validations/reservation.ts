import { z } from 'zod';

export const amenitySchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  capacity: z.coerce.number().int().positive().optional(),
  reservationCost: z.coerce.number().min(0).default(0),
  requiresApproval: z.coerce.boolean().default(false),
});

export const reservationSchema = z.object({
  condominiumId: z.string().uuid(),
  amenityId: z.string().uuid('Selecciona un área'),
  propertyId: z.string().uuid('Selecciona una unidad'),
  resDate: z.string().min(1, 'Indica la fecha'),
  startsAt: z.string().min(1, 'Indica la hora de inicio'),
  endsAt: z.string().min(1, 'Indica la hora de fin'),
});
