import { z } from 'zod';

export const communicationSchema = z.object({
  condominiumId: z.string().uuid(),
  title: z.string().min(3, 'El título es muy corto').max(150),
  body: z.string().min(10, 'El contenido es muy corto').max(5000),
  category: z.enum(['aviso', 'noticia', 'urgente', 'mantenimiento', 'asamblea', 'recordatorio_pago', 'suspension']),
  targetType: z.enum(['todos', 'rol']),
  targetRole: z.enum(['propietario', 'residente', 'inquilino', 'familiar', 'empleado']).optional(),
});
