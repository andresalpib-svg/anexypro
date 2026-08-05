import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MasterHeader } from './master-header';

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'master') redirect('/');

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <MasterHeader name={session.user.name ?? 'Master'} />
      {/* El relleno se achica en pantallas angostas: con p-6 fijo, en un
          teléfono se pierden 48 px de ancho útil. */}
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
