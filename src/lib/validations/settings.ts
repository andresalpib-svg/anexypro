import { z } from 'zod';

export const inviteUserSchema = z.object({
  fullName: z.string().min(2, 'El nombre es muy corto').max(120),
  email: z.string().email('Correo inválido'),
  tempPassword: z.string().min(8, 'La contraseña temporal debe tener al menos 8 caracteres'),
});
