import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  switch (session.user.role) {
    case 'master':
      redirect('/master');
    case 'admin_owner':
    case 'admin_staff':
      redirect('/app/dashboard');
    case 'contador':
      redirect('/app/finanzas');
    case 'seguridad':
      redirect('/seguridad/dashboard');
    case 'condomino':
      redirect('/portal/dashboard');
    default:
      redirect('/login');
  }
}
