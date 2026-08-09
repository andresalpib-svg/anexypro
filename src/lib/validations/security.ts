import { z } from 'zod';
import { fechaISOOpcional, telefonoOpcional } from './comunes';

export const visitSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  visitType: z.enum(['rapida', 'recurrente', 'entrega', 'empleado']),
  visitorName: z.string().min(2, 'Indica el nombre del visitante').max(120),
  visitorIdNumber: z.string().max(30).optional().or(z.literal('')),
  vehiclePlate: z.string().max(15).optional().or(z.literal('')),
  courier: z.string().max(80).optional().or(z.literal('')), // empresa
  phone: telefonoOpcional,
  relation: z.string().max(120).optional().or(z.literal('')),
  validDate: fechaISOOpcional,
  arrivalTime: z.string().optional().or(z.literal('')),
  startDate: fechaISOOpcional,
  endDate: fechaISOOpcional,
  allowedFrom: z.string().optional().or(z.literal('')),
  allowedUntil: z.string().optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const incidentSchema = z.object({
  condominiumId: z.string().uuid(),
  category: z.enum(['seguridad', 'mantenimiento', 'convivencia', 'otro']),
  title: z.string().min(3, 'Describe el incidente').max(150),
  description: z.string().max(1000).optional().or(z.literal('')),
});

export const packageSchema = z.object({
  condominiumId: z.string().uuid(),
  propertyId: z.string().uuid(),
  courier: z.string().max(60).optional().or(z.literal('')),
  description: z.string().max(200).optional().or(z.literal('')),
});
