import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesWithBalance } from '@/lib/services/finance';

/**
 * GET /api/finanzas/properties?condoId=<uuid>
 *
 * Filiales activas de un condominio con su saldo, su morosidad, si
 * tienen el servicio suspendido y el nombre del propietario. Lo
 * consumen los formularios de Cuotas y pagos y de Cobranza.
 *
 * Es de las pocas rutas de datos que quedan fuera de una Server
 * Action, así que tiene que preguntarse por su cuenta las tres cosas
 * —quién sos, qué permiso tenés, sobre cuál condominio— exactamente
 * igual que `requirePanel`:
 *
 *   · sesión;
 *   · permiso de Finanzas (`can`), que además deja fuera a `condomino`
 *     y a `seguridad`, que no son roles del panel;
 *   · y que el condominio pedido sea uno de los que la sesión puede
 *     ver (`listCondominiumsForSession`), no cualquiera de la empresa.
 *
 * Hasta la Etapa 8 solo comprobaba que hubiera sesión, con un TODO
 * encima que decía que la validación del condominio "ocurre en el
 * formulario". No ocurría en ninguna parte: `condoId` viaja en la URL.
 * Cualquier usuario con sesión —un condómino, el oficial de la
 * caseta— podía leer el saldo, los meses de atraso y el nombre del
 * propietario de TODAS las filiales de CUALQUIER condominio de la
 * empresa cambiando un parámetro (hallazgo 8.1, confirmado con
 * `scripts/atacar-etapa8.mjs`).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!can(session, 'finanzas')) {
    return NextResponse.json({ error: 'Sin acceso a Finanzas' }, { status: 403 });
  }

  const condoId = request.nextUrl.searchParams.get('condoId');
  if (!condoId) {
    return NextResponse.json({ error: 'condoId requerido' }, { status: 400 });
  }

  const companyId = session.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: 'Usuario sin empresa' }, { status: 403 });
  }

  // El condominio se valida contra los que ESTA sesión puede ver: un
  // supervisor solo administra los suyos, y un id de otra empresa no
  // aparece en esa lista.
  const condos = await listCondominiumsForSession(session);
  if (!condos.some((c) => c.id === condoId)) {
    return NextResponse.json({ error: 'Sin acceso a ese condominio' }, { status: 403 });
  }

  try {
    const properties = await listPropertiesWithBalance(companyId, condoId);

    return NextResponse.json(
      properties.map((p) => ({
        id: p.id,
        code: p.code,
        propertyType: p.propertyType,
        balance: p.balance,
        suspended: p.suspended,
        manualSuspension: p.manualSuspension,
        hasPaymentPlan: p.hasPaymentPlan,
        monthsOverdue: p.monthsOverdue,
        ownerName: p.ownerName,
      }))
    );
  } catch (error: any) {
    console.error('[API] Error cargando propiedades:', error);
    return NextResponse.json(
      { error: error?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
