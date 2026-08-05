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
    <div className="flex h-screen overflow-hidden" style={marca}>
      <SecuritySidebar session={session} />
      <main className="h-screen flex-1 overflow-y-auto bg-canvas p-6">{children}</main>
    </div>
  );
}
