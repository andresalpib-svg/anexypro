import { prisma } from '@/lib/db';
import { subscriptionState } from '@/lib/domain/subscription';
import type { SubscriptionState } from '@/lib/domain/subscription';

/**
 * Todo lo que el marco del panel necesita de la empresa, en UNA consulta.
 *
 * POR QUÉ EXISTE: el layout de `/app` pedía tres veces la MISMA fila de
 * `companies` —módulos ocultos, colores de marca y estado de la
 * suscripción—, y dos de esas veces en cascada, una después de otra.
 * Eran tres viajes a la base encadenados antes de dibujar nada, en
 * CADA navegación del panel. Con la base en otra región eso son unos
 * 120 ms de espera por clic que no dependen del volumen de datos.
 *
 * Las tres funciones que consumen estos campos (`subscriptionState`,
 * `brandStyle`, `isModuleHidden`) son puras, así que basta traerlos
 * juntos una vez y repartirlos.
 *
 * `companies` no lleva RLS a propósito (su aislamiento lo hace la
 * aplicación), por eso se consulta con el cliente normal.
 */
export type CompanyShell = {
  hiddenModules: string[];
  brand: { brandPrimary: string | null; brandDeep: string | null };
  subscription: SubscriptionState & { blocked: boolean };
};

export async function getCompanyShell(
  companyId: string,
  now: Date = new Date()
): Promise<CompanyShell> {
  const empresa = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      hiddenModules: true,
      brandPrimary: true,
      brandDeep: true,
      planId: true,
      nextPaymentDate: true,
      blockedAt: true,
      plan: { select: { graceDays: true } },
    },
  });

  if (!empresa) {
    return {
      hiddenModules: [],
      brand: { brandPrimary: null, brandDeep: null },
      subscription: { ...subscriptionState({}, now), blocked: false },
    };
  }

  const state = subscriptionState(
    {
      planId: empresa.planId,
      nextPaymentDate: empresa.nextPaymentDate,
      blockedAt: empresa.blockedAt,
      graceDays: empresa.plan?.graceDays ?? 5,
    },
    now
  );

  return {
    hiddenModules: empresa.hiddenModules ?? [],
    brand: { brandPrimary: empresa.brandPrimary, brandDeep: empresa.brandDeep },
    // Solo el bloqueo explícito corta el acceso: estar en mora avisa al
    // master, pero no deja a nadie fuera sin que él lo decida.
    subscription: { ...state, blocked: Boolean(empresa.blockedAt) },
  };
}
