import { z } from 'zod';
import { telefonoOpcional } from '@/lib/validations/comunes';

/** @db.Date: mediodía para que no se corra de día por zona horaria. */
const asDateOpt = (s: string | undefined) => (s ? new Date(`${s}T12:00:00`) : null);

export const assetSchema = z.object({
  condominiumId: z.string().uuid(),
  code: z.string().max(40).optional().or(z.literal('')),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
  location: z.string().max(100).optional().or(z.literal('')),
  purchaseDate: z.string().optional().or(z.literal('')).transform(asDateOpt),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  acquisitionValue: z.coerce.number().min(0).optional(),
  residualValue: z.coerce.number().min(0).optional(),
  usefulLifeMonths: z.coerce.number().int().positive().optional(),
  depreciationMethod: z.enum(['lineal']).optional().or(z.literal('')),
  depreciationStartDate: z.string().optional().or(z.literal('')).transform(asDateOpt),
});

export const updateAssetSchema = assetSchema.omit({ condominiumId: true }).extend({
  assetId: z.string().uuid(),
});

export const assetCategorySchema = z.object({
  condominiumId: z.string().uuid(),
  categoryId: z.string().uuid().optional().or(z.literal('')),
  name: z.string().min(2, 'Ponle un nombre a la categoría').max(60),
});

export const providerSchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(100),
  serviceType: z.string().max(80).optional().or(z.literal('')),
  phone: telefonoOpcional,
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
