'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { pickFile, IMAGE_EXT } from '@/lib/upload';
import { saveToRepository } from '@/lib/services/file-refs';
import {
  createCompanyWithAdmin,
  createAdminForCompany,
  updateCompany,
  resetUserPassword,
  setUserStatus,
  getUserDetail,
  type AltaResultado,
} from '@/lib/services/platform';

/** Todo lo de este archivo es de plataforma: solo el usuario master. */
async function guardMaster() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') return null;
  return session;
}

export type ActionState = { errors?: Record<string, string[]>; formError?: string; success?: boolean };

/**
 * El alta devuelve la contraseña en claro para mostrarla una sola vez.
 * Mientras no haya correo saliente configurado, es la única forma de
 * que el master pueda entregársela a la empresa.
 */
export type AltaState = ActionState & { credenciales?: AltaResultado };

const empresaSchema = z.object({
  legalName: z.string().min(3, 'Indicá la razón social').max(120),
  tradeName: z.string().max(120).optional().or(z.literal('')),
  taxId: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  brandPrimary: z.string().max(9).optional().or(z.literal('')),
  brandDeep: z.string().max(9).optional().or(z.literal('')),
  adminFullName: z.string().min(3, 'Indicá el nombre del administrador').max(120),
  adminEmail: z.string().email('El correo del administrador es inválido'),
  adminPassword: z.string().max(72).optional().or(z.literal('')),
});

export async function createCompanyAction(_prev: AltaState, formData: FormData): Promise<AltaState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master da de alta empresas.' };

  const parsed = empresaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  try {
    const credenciales = await createCompanyWithAdmin(
      { userId: session.user.id, userName: session.user.name ?? 'Master' },
      {
        legalName: parsed.data.legalName,
        tradeName: parsed.data.tradeName || undefined,
        taxId: parsed.data.taxId || undefined,
        email: parsed.data.email || undefined,
        phone: parsed.data.phone || undefined,
        brandPrimary: parsed.data.brandPrimary || undefined,
        brandDeep: parsed.data.brandDeep || undefined,
        adminFullName: parsed.data.adminFullName,
        adminEmail: parsed.data.adminEmail,
        adminPassword: parsed.data.adminPassword || undefined,
      }
    );
    revalidatePath('/master');
    revalidatePath('/master/empresas');
    return { success: true, credenciales };
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear la empresa.' };
  }
}

export async function createAdminAction(_prev: AltaState, formData: FormData): Promise<AltaState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master crea administradores.' };

  const companyId = String(formData.get('companyId') ?? '');
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();

  if (!companyId || fullName.length < 3 || !email.includes('@')) {
    return { formError: 'Indicá el nombre y un correo válido.' };
  }

  try {
    const credenciales = await createAdminForCompany(
      { userId: session.user.id, userName: session.user.name ?? 'Master' },
      companyId,
      { fullName, email, password: password || undefined }
    );
    revalidatePath(`/master/empresas/${companyId}`);
    return { success: true, credenciales };
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo crear el administrador.' };
  }
}

export async function updateCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await guardMaster();
  if (!session) return { formError: 'Solo el usuario master edita las empresas.' };

  const companyId = String(formData.get('companyId') ?? '');
  if (!companyId) return { formError: 'Falta la empresa.' };

  try {
    const logo = pickFile(formData, 'logo');
    const logoUrl = logo
      ? await saveToRepository(logo, { kind: 'company', slug: 'marca', name: 'Identidad de la empresa' }, { allowedExt: IMAGE_EXT })
      : undefined;

    await updateCompany({ userId: session.user.id, userName: session.user.name ?? 'Master' }, companyId, {
      legalName: String(formData.get('legalName') ?? '') || undefined,
      tradeName: String(formData.get('tradeName') ?? ''),
      taxId: String(formData.get('taxId') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      brandPrimary: String(formData.get('brandPrimary') ?? ''),
      brandDeep: String(formData.get('brandDeep') ?? ''),
      logoUrl,
      status: String(formData.get('status') ?? '') || undefined,
    });
  } catch (e: any) {
    return { formError: e?.message ?? 'No se pudo guardar.' };
  }
  revalidatePath('/master');
  revalidatePath(`/master/empresas/${companyId}`);
  return { success: true };
}

export type ResetState = { error?: string; email?: string; password?: string };

export async function resetPasswordAction(userId: string, nueva?: string): Promise<ResetState> {
  const session = await guardMaster();
  if (!session) return { error: 'Solo el usuario master restablece contraseñas.' };
  try {
    const r = await resetUserPassword(
      { userId: session.user.id, userName: session.user.name ?? 'Master' },
      userId,
      nueva
    );
    revalidatePath('/master/usuarios');
    return r;
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo restablecer la contraseña.' };
  }
}

export async function setUserStatusAction(
  userId: string,
  status: 'activo' | 'bloqueado' | 'inactivo'
): Promise<{ ok: boolean; error?: string }> {
  const session = await guardMaster();
  if (!session) return { ok: false, error: 'Solo el usuario master cambia el estado de los usuarios.' };
  try {
    await setUserStatus({ userId: session.user.id, userName: session.user.name ?? 'Master' }, userId, status);
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo actualizar.' };
  }
  revalidatePath('/master/usuarios');
  return { ok: true };
}


/** Ficha del usuario, para el panel de detalle. */
export type DetalleUsuario = {
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  companyName: string;
  createdAt: string;
  lastLoginAt: string | null;
  condominios: string[];
  persona: { fullName: string; idNumber: string | null; unidades: string[] } | null;
  accesos: { eventType: string; createdAt: string }[];
};

export async function getUserDetailAction(userId: string): Promise<DetalleUsuario | null> {
  const session = await guardMaster();
  if (!session) return null;

  const u = await getUserDetail(userId);
  if (!u) return null;

  return {
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    companyName: u.company.tradeName ?? u.company.legalName,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    condominios: u.condominios,
    persona: u.persona
      ? {
          fullName: u.persona.fullName,
          idNumber: u.persona.idNumber,
          unidades: u.persona.memberships.map(
            (m) => `${m.property.code} (${m.property.condominium.name})`
          ),
        }
      : null,
    accesos: u.accesos.map((a) => ({ eventType: a.eventType, createdAt: a.createdAt.toISOString() })),
  };
}
