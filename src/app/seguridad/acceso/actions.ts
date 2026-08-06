'use server';

import { requireSecurity } from '@/lib/guard';
import { searchAccess } from '@/lib/services/properties';

/**
 * Consulta de la caseta: devuelve residentes y vehículos de la unidad.
 * Son datos personales, así que exige ser oficial de seguridad — no
 * basta con tener una sesión abierta.
 */
export async function searchAccessAction(condominiumId: string, query: string) {
  const session = await requireSecurity(condominiumId);
  if (!session) return { members: [], vehicles: [] };
  return searchAccess(session.user.companyId, condominiumId, query);
}
