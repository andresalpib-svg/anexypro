import { z } from 'zod';

export const assemblySchema = z.object({
  condominiumId: z.string().uuid(),
  type: z.enum(['ordinaria', 'extraordinaria']),
  title: z.string().min(3, 'El título es muy corto').max(150),
  eventDate: z.string().min(1, 'Indica la fecha'),
  eventTime: z.string().min(1, 'Indica la hora'),
  location: z.string().max(150).optional().or(z.literal('')),
  convocatoriaBody: z.string().min(10, 'Redacta la convocatoria').max(5000),
  topics: z.string().min(1, 'Agrega al menos un tema'), // un tema por línea, se separa en el server action
});

export const minutesSchema = z.object({
  assemblyId: z.string().uuid(),
  minutesBody: z.string().min(10, 'Redacta el acta').max(10000),
});
