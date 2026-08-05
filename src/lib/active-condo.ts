import { cookies } from 'next/headers';

export const ACTIVE_CONDO_COOKIE = 'anexypro-condo-activo';

/**
 * Condominio Activo (multi-condominio): la selección persiste en una
 * cookie para que al navegar entre módulos NO se pierda. La cookie
 * solo se respeta si el id pertenece a los condominios de la empresa
 * de la sesión — jamás puede cruzar información entre empresas.
 */
export function getActiveCondoId(condos: { id: string }[]): string | undefined {
  const saved = cookies().get(ACTIVE_CONDO_COOKIE)?.value;
  if (saved && condos.some((c) => c.id === saved)) return saved;
  return undefined;
}

/** Resolución estándar: URL → cookie válida → primer condominio. */
export function resolveCondoId(searchCondoId: string | undefined, condos: { id: string }[]): string | undefined {
  if (searchCondoId && condos.some((c) => c.id === searchCondoId)) return searchCondoId;
  return getActiveCondoId(condos) ?? condos[0]?.id;
}
