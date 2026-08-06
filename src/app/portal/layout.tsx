import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { brandStyle } from '@/lib/branding';
import { getCompanySubscription } from '@/lib/services/subscriptions';
import { getResidentContext } from '@/lib/services/resident-context';
import { ResidentSidebar } from '@/components/layout/resident-sidebar';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'condomino') redirect('/login');

  // Misma identidad visual que el panel de su empresa.
  const empresa = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { brandPrimary: true, brandDeep: true },
  });
  const marca = brandStyle(empresa ?? {});

  // Con la suscripción bloqueada el residente sigue consultando su
  // información, pero las funciones de acceso —autorizar visitas y
  // reservar áreas— dejan de operar.
  const suscripcion = await getCompanySubscription(session.user.companyId);

  const ctx = await getResidentContext(session.user.id);
  if (!ctx) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="card max-w-md p-8 text-center">
          <p className="font-semibold text-ink">Tu cuenta todavía no está vinculada a ninguna unidad.</p>
          <p className="mt-2 text-sm text-muted">
            Contacta a la administración de tu condominio para que te registre como residente de tu
            propiedad.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={marca}>
      <ResidentSidebar
        name={session.user.name ?? 'Residente'}
        unitLabel={`${ctx.property.code} · ${ctx.condominium.name}`}
        units={ctx.units.map((u) => ({ propertyId: u.propertyId, code: u.code, condominiumName: u.condominiumName }))}
        selectedUnitId={ctx.property.id}
      />
      {/* pt-14 en móvil: deja sitio a la barra superior con el menú. */}
      <main className="h-screen min-w-0 flex-1 overflow-y-auto bg-canvas p-4 pt-14 sm:p-6 lg:pt-6">{children}</main>
    </div>
  );
}
