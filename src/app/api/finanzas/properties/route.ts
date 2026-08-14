import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listPropertiesWithBalance } from '@/lib/services/finance';

/**
 * GET /api/finanzas/properties?condoId=<uuid>
 *
 * Devuelve todas las propiedades activas de un condominio con sus saldos
 * actualizados. Usado para los formularios de pago y cobranza.
 *
 * Validaciones:
 * - El condominio debe pertenecer a la empresa del usuario
 * - El usuario debe tener permiso Finanzas
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const condoId = request.nextUrl.searchParams.get('condoId');
  if (!condoId) {
    return NextResponse.json({ error: 'condoId requerido' }, { status: 400 });
  }

  try {
    // TODO: Verificar que el condominio pertenezca a la empresa del usuario
    // Esto debe agregarse cuando se tenga acceso a la BD en route handlers
    // Por ahora, la validación ocurre en el formulario (makePaymentAction)

    const companyId = (session.user as any).companyId;
    if (!companyId) {
      return NextResponse.json({ error: 'Usuario sin empresa' }, { status: 403 });
    }

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
