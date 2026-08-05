import { z } from 'zod';

export const condominiumSchema = z.object({
  name: z.string().min(2, 'El nombre es muy corto').max(120),
  code: z
    .string()
    .min(2, 'El código debe tener al menos 2 caracteres')
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, 'Solo letras, números y guiones')
    .transform((v) => v.toUpperCase()),
  type: z.enum(['residencial', 'vertical', 'mixto', 'comercial']),
  addressLine: z.string().max(200).optional().or(z.literal('')),
  province: z.string().max(80).optional().or(z.literal('')),
  canton: z.string().max(80).optional().or(z.literal('')),
  district: z.string().max(80).optional().or(z.literal('')),
  currency: z.enum(['CRC', 'USD']),
  baseFee: z.coerce.number().min(0, 'La cuota no puede ser negativa'),
  dueDay: z.coerce.number().int().min(1).max(28),
  suspensionMonths: z.coerce.number().int().min(1).max(24),
  notes: z.string().max(2000).optional().or(z.literal('')),
  unitsCount: z.coerce.number().int().min(0, 'No puede ser negativa').max(2000, 'Máximo 2000 unidades').optional(),
  unitsType: z.enum(['casa', 'apartamento']).default('casa'),
});

export type CondominiumInput = z.infer<typeof condominiumSchema>;
