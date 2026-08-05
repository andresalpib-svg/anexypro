'use server';

import { cookies } from 'next/headers';
import { ACTIVE_CONDO_COOKIE } from '@/lib/active-condo';

/** Guarda el Condominio Activo — persiste entre módulos y sesiones. */
export async function setActiveCondoAction(condoId: string) {
  cookies().set(ACTIVE_CONDO_COOKIE, condoId, { path: '/', maxAge: 60 * 60 * 24 * 365 });
}
