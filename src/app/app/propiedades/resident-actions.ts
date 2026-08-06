'use server';

import { revalidatePath } from 'next/cache';
import { requirePanel, requireOwner, allowsCondo, SIN_PERMISO } from '@/lib/guard';
import { personSchema, updatePersonSchema, vehicleSchema, petSchema, emergencyContactSchema } from '@/lib/validations/resident';
import {
  addPersonToProperty,
  removePropertyMember,
  updatePerson,
  addVehicle,
  addPet,
  addEmergencyContact,
} from '@/lib/services/properties';
import { condoOfProperty, condoOfMember, condosOfPerson } from '@/lib/services/entity-scope';
import { importResidentsExcel } from '@/lib/services/import-excel';
import { pickFile } from '@/lib/upload';

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };
const ok: ActionState = { success: true };

/**
 * Aquí se manejan datos personales de residentes: nombres, cédulas,
 * correos, vehículos, contactos de emergencia. La unidad llega en el
 * formulario, así que en todas hay que confirmar que el condominio de
 * esa unidad es uno de los que la sesión tiene a su cargo.
 */
const MODULO = '/app/propiedades';

/** Sesión con acceso al condominio al que pertenece esta unidad. */
async function panelForProperty(propertyId: string) {
  const session = await requirePanel({ module: MODULO });
  if (!session) return null;
  const condoId = await condoOfProperty(session.user.companyId, propertyId);
  return (await allowsCondo(session, condoId)) ? session : null;
}

export async function addPersonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = personSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await panelForProperty(parsed.data.propertyId);
  if (!session) return { formError: SIN_PERMISO };

  if (parsed.data.password && !parsed.data.email) {
    return { errors: { email: ['Para crear el usuario de acceso, indica también el correo.'] } };
  }

  const person = await addPersonToProperty(session.user.companyId, parsed.data.propertyId, parsed.data);

  // Contraseña escrita → se crea de una vez el usuario del portal.
  if (parsed.data.password && parsed.data.email) {
    try {
      const { createUserForPerson } = await import('@/lib/services/user-provisioning');
      await createUserForPerson(session.user.companyId, person.id, {
        email: parsed.data.email,
        password: parsed.data.password,
        fullName: parsed.data.fullName,
      });
    } catch (e: any) {
      const reason = e?.code === 'P2002' ? 'ya existe una cuenta con ese correo' : (e?.message ?? 'error');
      return { formError: `Persona agregada, pero no se pudo crear el usuario: ${reason}.` };
    }
  }

  revalidatePath(`/app/propiedades/${parsed.data.propertyId}`);
  revalidatePath('/app/propiedades');
  return ok;
}

/**
 * Da de baja a una persona de una unidad.
 *
 * DEVUELVE el resultado en vez de dejar escapar la excepción. Antes no
 * lo hacía, y como se llama desde el navegador —dentro de una
 * transición o de un `<form action>`— cualquier fallo aquí no llegaba
 * como mensaje: React lo entregaba a la frontera de error y la pantalla
 * entera se sustituía por "Algo salió mal" con un código. Dos casos
 * reales lo provocan: que el vínculo ya no exista (dos pestañas, o dos
 * personas dando de baja al mismo residente) y que la base falle. Ni
 * uno ni otro justifica tumbar la pantalla.
 */
export async function removeMemberAction(
  memberId: string,
  propertyId: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePanel({ module: MODULO });
  if (!session) return { ok: false, error: SIN_PERMISO };

  try {
    // El condominio sale del vínculo mismo, no del propertyId del cliente.
    const condoId = await condoOfMember(session.user.companyId, memberId);
    if (!(await allowsCondo(session, condoId))) return { ok: false, error: SIN_PERMISO };

    await removePropertyMember(session.user.companyId, memberId);
  } catch (e: any) {
    // P2025 / NotFoundError = el vínculo ya no está. Para quien mira la
    // pantalla el resultado es el mismo que buscaba, así que se dice
    // eso y no un error técnico.
    if (e?.code === 'P2025' || e?.name === 'NotFoundError') {
      return { ok: false, error: 'Ese residente ya no está vinculado a la unidad. Actualizá la pantalla.' };
    }
    return { ok: false, error: e?.message ?? 'No se pudo dar de baja al residente.' };
  }

  revalidatePath(`/app/propiedades/${propertyId}`);
  revalidatePath('/app/propiedades');
  return { ok: true };
}

export async function updatePersonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updatePersonSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await requirePanel({ module: MODULO });
  if (!session) return { formError: SIN_PERMISO };

  const { personId, ...data } = parsed.data;
  // Una persona puede vivir en unidades de varios condominios: basta
  // con tener a cargo uno de ellos para poder corregir sus datos.
  const condos = await condosOfPerson(session.user.companyId, personId);
  const permitidos = await Promise.all(condos.map((c) => allowsCondo(session, c)));
  if (!permitidos.some(Boolean)) return { formError: SIN_PERMISO };

  try {
    await updatePerson(session.user.companyId, personId, data);
  } catch (err: any) {
    if (err?.code === 'P2002') return { errors: { email: ['Ya existe un residente con ese correo en tu empresa.'] } };
    return { formError: 'No se pudo actualizar el residente.' };
  }
  revalidatePath('/app/propiedades');
  return ok;
}

export type ProvisionState = {
  formError?: string;
  success?: boolean;
  summary?: string;
  errors?: string[];
};

export async function provisionUsersAction(_prev: ProvisionState, formData: FormData): Promise<ProvisionState> {
  const condominiumId = String(formData.get('condominiumId') ?? '');
  if (!condominiumId) return { formError: 'Selecciona un condominio.' };

  const session = await requireOwner({ module: MODULO, condominiumId });
  if (!session) return { formError: 'Solo el administrador principal puede crear usuarios de condóminos.' };

  try {
    const { provisionCondoUsers } = await import('@/lib/services/user-provisioning');
    const r = await provisionCondoUsers(session.user.companyId, condominiumId, {
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Usuario',
    });
    revalidatePath('/app/propiedades');
    return {
      success: true,
      summary: `Cuentas creadas: ${r.created} · Correos enviados: ${r.emailed} · Ya tenían cuenta (vinculadas): ${r.linked} · Con error: ${r.errors.length}`,
      errors: r.errors.map((e) => `${e.name}: ${e.reason}`),
    };
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudieron crear los usuarios.' };
  }
}

export type ImportState = {
  formError?: string;
  success?: boolean;
  summary?: string;
  skipped?: string[];
};

export async function importExcelAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const condominiumId = String(formData.get('condominiumId') ?? '');
  if (!condominiumId) return { formError: 'Selecciona un condominio.' };

  const session = await requirePanel({ module: MODULO, condominiumId });
  if (!session) return { formError: SIN_PERMISO };

  const file = pickFile(formData, 'excelFile');
  if (!file) return { formError: 'Adjunta el archivo de Excel.' };

  try {
    const r = await importResidentsExcel(session.user.companyId, condominiumId, Buffer.from(await file.arrayBuffer()));
    revalidatePath('/app/propiedades');
    return {
      success: true,
      summary: `Filiales nuevas: ${r.unitsCreated} · Titulares: ${r.residentsCreated} · Habitantes: ${r.cohabitantsCreated} · Vehículos: ${r.vehiclesCreated} · Visitas recurrentes: ${r.visitsCreated} · Filas con aviso: ${r.rowsSkipped.length}`,
      skipped: r.rowsSkipped.map((s) => `Fila ${s.row}: ${s.reason}`),
    };
  } catch (err: any) {
    return { formError: err?.message ?? 'No se pudo importar el archivo.' };
  }
}

export async function addVehicleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = vehicleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await panelForProperty(parsed.data.propertyId);
  if (!session) return { formError: SIN_PERMISO };

  await addVehicle(session.user.companyId, parsed.data.propertyId, parsed.data);
  revalidatePath(`/app/propiedades/${parsed.data.propertyId}`);
  return ok;
}

export async function addPetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = petSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await panelForProperty(parsed.data.propertyId);
  if (!session) return { formError: SIN_PERMISO };

  await addPet(session.user.companyId, parsed.data.propertyId, parsed.data);
  revalidatePath(`/app/propiedades/${parsed.data.propertyId}`);
  return ok;
}

export async function addEmergencyContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = emergencyContactSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const session = await panelForProperty(parsed.data.propertyId);
  if (!session) return { formError: SIN_PERMISO };

  await addEmergencyContact(session.user.companyId, parsed.data.propertyId, parsed.data);
  revalidatePath(`/app/propiedades/${parsed.data.propertyId}`);
  return ok;
}
