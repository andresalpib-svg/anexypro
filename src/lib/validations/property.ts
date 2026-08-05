import { z } from 'zod';

export const propertySchema = z.object({
  condominiumId: z.string().uuid('Selecciona un condominio'),
  code: z.string().min(1, 'El código es requerido').max(20),
  propertyType: z.enum(['casa', 'apartamento', 'local', 'lote', 'parqueo', 'bodega']),
  floor: z.coerce.number().int().optional().nullable(),
  areaM2: z.coerce.number().min(0).optional().nullable(),
  parkingSpaces: z.coerce.number().int().min(0).default(0),
});

export type PropertyInput = z.infer<typeof propertySchema>;
