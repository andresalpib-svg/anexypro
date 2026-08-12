'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireOwner, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { canCreateCondominium } from '@/lib/services/subscriptions';
import { condominiumSchema } from '@/lib/validations/condominium';
import { createCondominium, assignSupervisor, removeSupervisor } from '@/lib/services/condominiums';
import { condoOfSupervisor } from '@/lib/services/entity-scope';
import { bulkCreateProperties } from '@/lib/services/properties';
import { importResidentsExcel } from '@/lib/services/import-excel';
import { pickFile } from '@/lib/upload';

export type CreateCondoState = {
  errors?: Record<string, string[]>;
  formError?: string;
};

export async function createCondominiumAction(
  _prevState: CreateCondoState,
  formData: FormData
): Promise<CreateCondoState> {
  // Dar de alta un condominio compromete a la empresa entera: es del
  // titular. El supervisor administra los que se le asignan, y el
  // contador no administra ninguno.
  const session = await requireOwner();
  if (!session) return { formError: SIN_PERMISO };

  // Tope del plan contratado. Se comprueba antes de crear nada: pasarse
  // y descubrirlo después obligaría a borrar un condominio recién dado
  // de alta con sus unidades dentro.
  const cupo = await canCreateCondominium(session.user.companyId);
  if (!cupo.ok) return { formError: cupo.reason ?? 'Alcanzaste el tope de condominios de tu plan.' };

  const raw = Object.fromEntries(formData.entries());
  const parsed = condominiumSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }

  let condo;
  try {
    condo = await createCondominium(session.user.companyId, session.user.id, session.user.name ?? session.user.email ?? 'Usuario', parsed.data);

    // Alta inmediata de unidades: cantidad indicada en el formulario.
    if (parsed.data.unitsCount && parsed.data.unitsCount > 0) {
      await bulkCreateProperties(session.user.companyId, condo.id, parsed.data.unitsCount, parsed.data.unitsType);
    }

    // Base de datos en Excel adjunta (opcional): unidades + residentes.
    const excelFile = pickFile(formData, 'excelFile');
    if (excelFile) {
      await importResidentsExcel(session.user.companyId, condo.id, Buffer.from(await excelFile.arrayBuffer()));
    }
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return { errors: { code: ['Ya existe un condominio con ese código en tu empresa.'] } };
    }
    if (condo) {
      // El condominio ya existe; el fallo fue en unidades/Excel — se
      // informa el motivo real en vez de un mensaje genérico.
      return { formError: `Condominio creado, pero falló la carga de unidades: ${err?.message ?? 'error desconocido'}` };
    }
    return { formError: 'No se pudo crear el condominio. Intenta de nuevo.' };
  }

  revalidatePath('/app/condominios');
  redirect(`/app/condominios/${condo.id}`);
}

export async function assignSupervisorAction(
  condominiumId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo el administrador principal asigna supervisores.' };
  }
  // Segunda verificación en código, no solo RLS (auditoría de
  // seguridad 2026-08-11, hallazgo #11): `assignSupervisor` nunca
  // comprobó que `condominiumId` fuera de esta empresa antes de
  // insertar la asignación.
  if (!(await allowsCondo(session, condominiumId))) {
    return { ok: false, error: 'No tienes acceso a ese condominio.' };
  }
  try {
    await assignSupervisor(session.user.companyId, condominiumId, userId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo asignar el supervisor.' };
  }
  revalidatePath(`/app/condominios/${condominiumId}`);
  return { ok: true };
}

export async function removeSupervisorAction(
  condominiumId: string,
  supervisorId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin_owner') {
    return { ok: false, error: 'Solo el administrador principal asigna supervisores.' };
  }
  if (!(await allowsCondo(session, condominiumId))) {
    return { ok: false, error: 'No tienes acceso a ese condominio.' };
  }
  // `removeSupervisor` nunca usaba `condominiumId` — solo `supervisorId`,
  // dependía por completo de RLS para no borrar la asignación de otra
  // empresa. Se cruza acá antes de borrar.
  try {
    const condoReal = await condoOfSupervisor(session.user.companyId, supervisorId);
    if (condoReal !== condominiumId) {
      return { ok: false, error: 'Ese supervisor no pertenece a ese condominio.' };
    }
    await removeSupervisor(session.user.companyId, supervisorId);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo quitar el supervisor.' };
  }
  revalidatePath(`/app/condominios/${condominiumId}`);
  return { ok: true };
}
