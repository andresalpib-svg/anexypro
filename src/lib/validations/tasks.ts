import { z } from 'zod';

export const TASK_CATEGORIES = ['Administrativo', 'Operativo', 'Financiero', 'Servicio al Cliente', 'Áreas Comunes'] as const;

const base = {
  title: z.string().min(2, 'El título es muy corto').max(150),
  category: z.enum(TASK_CATEGORIES, { errorMap: () => ({ message: 'Selecciona una categoría' }) }),
  assignedToId: z.string().uuid().optional().or(z.literal('')),
  // Condominio al que corresponde la tarea (lo elige la administración).
  condominiumId: z.string().uuid().optional().or(z.literal('')),
  priority: z.enum(['baja', 'media', 'alta']),
  dueDate: z.string().optional().or(z.literal('')), // YYYY-MM-DD
  alarmAt: z.string().optional().or(z.literal('')), // YYYY-MM-DDTHH:mm
  notes: z.string().max(2000).optional().or(z.literal('')),
};

export const createTaskSchema = z.object(base);

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pendiente', 'en_progreso', 'completada']),
  ...base,
});

export const checklistItemSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1, 'Escribe el punto del checklist').max(200),
});
