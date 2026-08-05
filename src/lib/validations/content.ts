import { z } from 'zod';
import { urlExterna } from './comunes';

export const contentItemSchema = z.object({
  condominiumId: z.string().uuid(),
  category: z.enum(['video', 'manual', 'reglamento', 'curso', 'consejo', 'emergencia', 'reciclaje', 'seguridad']),
  title: z.string().min(3, 'El título es muy corto').max(150),
  description: z.string().max(1000).optional().or(z.literal('')),
  fileUrl: urlExterna.optional().or(z.literal('')),
  videoUrl: urlExterna.optional().or(z.literal('')),
  publish: z.coerce.boolean().default(false),
});
