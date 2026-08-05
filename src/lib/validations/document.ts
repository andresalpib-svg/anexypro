import { z } from 'zod';

export const documentSchema = z.object({
  condominiumId: z.string().uuid(),
  category: z.enum(['reglamento', 'contrato', 'manual', 'seguro', 'garantia', 'plano', 'otro']),
  title: z.string().min(3, 'El título es muy corto').max(150),
  visibility: z.enum(['admin', 'residentes']),
  expiresOn: z.string().optional().or(z.literal('')),
  fileName: z.string().min(1, 'Indica el nombre del archivo').max(150),
  fileUrl: z.string().url('Indica una URL válida'),
});

export const versionSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string().min(1).max(150),
  fileUrl: z.string().url('Indica una URL válida'),
  notes: z.string().max(300).optional().or(z.literal('')),
});

export const bodyTextSchema = z.object({
  documentId: z.string().uuid(),
  bodyText: z.string().min(1, 'El contenido no puede estar vacío').max(50000),
});
