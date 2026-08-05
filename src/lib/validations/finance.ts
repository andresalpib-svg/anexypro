import { z } from 'zod';

export const billingSchema = z.object({
  condominiumId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato AAAA-MM'),
});

export const chargeSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  chargeType: z.enum([
    'cuota_extraordinaria',
    'interes_moratorio',
    'multa',
    'reposicion_danos',
    'mantenimiento_parqueo',
    'agua_potable',
    'quick_pass',
    'reserva_area_social',
    'otro',
  ]),
  description: z.string().min(2, 'Describe el cargo').max(200),
  amount: z.coerce.number().positive('El monto debe ser mayor a cero'),
  dueDate: z.string().min(1, 'Indica la fecha de vencimiento'),
});

export const paymentSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  amount: z.coerce.number().positive('El monto debe ser mayor a cero'),
  method: z.enum(['transferencia', 'sinpe', 'efectivo', 'tarjeta', 'deposito', 'comprobante']),
  reference: z.string().max(80).optional().or(z.literal('')),
  notes: z.string().max(300).optional().or(z.literal('')),
});
