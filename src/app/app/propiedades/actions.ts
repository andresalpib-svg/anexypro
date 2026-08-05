'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, SIN_PERMISO } from '@/lib/guard';
import { propertySchema } from '@/lib/validations/property';
import { createProperty } from '@/lib/services/properties';

export type CreatePropertyState = {
  errors?: Record<string, string[]>;
  formError?: string;
  success?: boolean;
};

export async function createPropertyAction(
  _prevState: CreatePropertyState,
  formData: FormData
): Promise<CreatePropertyState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = propertySchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const session = await requirePanel({
    module: '/app/propiedades',
    condominiumId: parsed.data.condominiumId,
  });
  if (!session) return { formError: SIN_PERMISO };

  try {
    await createProperty(session.user.companyId, parsed.data);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return { errors: { code: ['Ya existe una unidad con ese código en este condominio.'] } };
    }
    return { formError: 'No se pudo crear la propiedad. Intenta de nuevo.' };
  }

  revalidatePath('/app/propiedades');
  return { success: true };
}
