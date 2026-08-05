import { z } from 'zod';

export const personSchema = z.object({
  propertyId: z.string().uuid(),
  fullName: z.string().min(2, 'El nombre es muy corto').max(150),
  idNumber: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  role: z.enum(['propietario', 'residente', 'inquilino', 'familiar', 'empleado']),
  // Si se escribe una contraseña, se crea el usuario de acceso del
  // Ecosistema Condómino (requiere correo).
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').optional().or(z.literal('')),
});

export const updatePersonSchema = z.object({
  personId: z.string().uuid(),
  fullName: z.string().min(2, 'El nombre es muy corto').max(150),
  idNumber: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
});

export const vehicleSchema = z.object({
  propertyId: z.string().uuid(),
  plate: z.string().min(3, 'La placa es muy corta').max(15),
  brand: z.string().max(40).optional().or(z.literal('')),
  model: z.string().max(40).optional().or(z.literal('')),
  color: z.string().max(30).optional().or(z.literal('')),
  vehicleType: z.enum(['automovil', 'motocicleta', 'bicicleta', 'otro']),
});

export const petSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1, 'El nombre es requerido').max(60),
  species: z.enum(['perro', 'gato', 'ave', 'otro']),
  breed: z.string().max(60).optional().or(z.literal('')),
});

export const emergencyContactSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(2, 'El nombre es muy corto').max(120),
  phone: z.string().min(4, 'Indica un teléfono').max(30),
  relationship: z.string().max(60).optional().or(z.literal('')),
});
