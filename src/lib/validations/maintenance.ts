import { z } from 'zod';

export const assetSchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  category: z.enum(['elevador', 'bomba', 'generador', 'piscina', 'porton', 'techo', 'otro']),
  description: z.string().max(500).optional().or(z.literal('')),
  approxCost: z.coerce.number().min(0).optional(),
  location: z.string().max(100).optional().or(z.literal('')),
});

export const updateAssetSchema = assetSchema.omit({ condominiumId: true }).extend({
  assetId: z.string().uuid(),
});

export const providerSchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  serviceType: z.string().max(80).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
});

export const updateProviderSchema = providerSchema.omit({ condominiumId: true }).extend({
  providerId: z.string().uuid(),
});

export const ticketSchema = z.object({
  condominiumId: z.string().uuid(),
  assetId: z.string().uuid().optional().or(z.literal('')),
  providerId: z.string().uuid().optional().or(z.literal('')),
  ticketType: z.enum(['preventivo', 'correctivo']),
  title: z.string().min(3, 'Describe el ticket').max(150),
  description: z.string().max(1000).optional().or(z.literal('')),
  priority: z.enum(['baja', 'media', 'alta']),
});

export const completeTicketSchema = z.object({
  ticketId: z.string().uuid(),
  cost: z.coerce.number().min(0).optional(),
});
