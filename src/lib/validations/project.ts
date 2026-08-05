import { z } from 'zod';
import { fechaISOOpcional } from './comunes';

export const projectSchema = z.object({
  condominiumId: z.string().uuid(),
  name: z.string().min(3, 'El nombre es muy corto').max(150),
  description: z.string().max(2000).optional().or(z.literal('')),
  budget: z.coerce.number().min(0),
  startDate: fechaISOOpcional,
  endDate: fechaISOOpcional,
});

export const milestoneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(2).max(150),
  dueDate: fechaISOOpcional,
});

export const checklistSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(150),
});

export const expenseSchema = z.object({
  projectId: z.string().uuid(),
  condominiumId: z.string().uuid(),
  description: z.string().min(2).max(200),
  amount: z.coerce.number().positive('El monto debe ser mayor a cero'),
});

export const updateSchema = z.object({
  projectId: z.string().uuid(),
  description: z.string().min(2).max(1000),
  progressPct: z.coerce.number().min(0).max(100).optional(),
});
