'use server';

import { requirePanel } from '@/lib/guard';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { globalSearch } from '@/lib/services/search';

/**
 * La búsqueda recorre condominios, unidades, documentos, tickets,
 * asambleas y proyectos. Se acota a los condominios que la sesión tiene
 * a su cargo: un supervisor no debe encontrar por aquí lo que no puede
 * abrir, y el contador no tiene nada que buscar fuera de lo financiero.
 */
export async function globalSearchAction(query: string) {
  const session = await requirePanel();
  if (!session) return [];

  const condos = await listCondominiumsForSession(session);
  return globalSearch(session.user.companyId, query, condos.map((c) => c.id));
}
