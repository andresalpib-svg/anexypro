import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { brandStyle } from '@/lib/branding';
import { SecuritySidebar } from '@/components/layout/security-sidebar';

export default async function SecurityLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'seguridad') redirect('/login');

  // Misma identidad visual que el panel de su empresa.
  const empresa = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { brandPrimary: true, brandDeep: true },
  });
  const marca = brandStyle(empresa ?? {});

  return (
    // h-dvh (con h-screen de respaldo): en el teléfono, 100vh mide más
    // que la pantalla útil y el final de cada pantalla quedaba debajo
    // de la barra del navegador.
    <div className="flex h-screen overflow-hidden supports-[height:100dvh]:h-dvh" style={marca}>
      <SecuritySidebar session={session} />
      {/* pt-14 en móvil: deja sitio a la barra superior con el menú. */}
      <main className="h-screen min-w-0 flex-1 overflow-y-auto bg-canvas p-4 pt-14 supports-[height:100dvh]:h-dvh sm:p-6 lg:pt-6">
        {children}
      </main>
    </div>
  );
}
