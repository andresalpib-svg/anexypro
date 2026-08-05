import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getHiddenModules, isModuleHidden } from '@/lib/services/module-visibility';
import { getTaskNotifications } from '@/lib/services/tasks';
import { getOverdueBriefing } from '@/lib/services/overdue-briefing';
import { prisma } from '@/lib/db';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { OverdueModal } from '@/components/layout/overdue-modal';
import { brandStyle } from '@/lib/branding';
import { getCompanySubscription } from '@/lib/services/subscriptions';
import { BlockedScreen } from '@/components/layout/blocked-screen';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff', 'contador'].includes(session.user.role)) {
    redirect('/login');
  }

  const [notifications, briefing, me, hiddenModules] = await Promise.all([
    // Alarmas de Gestión de Tareas: vencidas (obligatorio) + programadas.
    getTaskNotifications(session.user.companyId),
    // Aviso de primera instancia: pendientes con 2+ días de atraso.
    getOverdueBriefing(session.user.companyId),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { photoUrl: true } }),
    // Módulos que el master apagó para esta empresa.
    getHiddenModules(session.user.companyId),
  ]);

  // Identidad visual de la empresa. `companies` no lleva RLS, así que
  // se lee directo. Si no tiene marca propia, `brandStyle` devuelve un
  // objeto vacío y el panel se queda con la paleta de `globals.css`.
  const empresa = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { brandPrimary: true, brandDeep: true },
  });
  const marca = brandStyle(empresa ?? {});

  // Bloqueo por URL: ocultar el módulo del menú no basta si el usuario
  // escribe la dirección a mano.
  const pathname = headers().get('x-pathname') ?? '';
  if (pathname && isModuleHidden(hiddenModules, pathname)) redirect('/app/dashboard');

  // Suscripción bloqueada. El administrador entra pero solo ve la
  // pantalla de pago; el supervisor y el contador quedan fuera. No se
  // borra ni se oculta información: solo se cierra el paso.
  const suscripcion = await getCompanySubscription(session.user.companyId);
  if (suscripcion.blocked) {
    if (session.user.role === 'admin_owner') {
      if (pathname !== '/app/suscripcion') redirect('/app/suscripcion');
    } else {
      return <BlockedScreen rol={session.user.role} />;
    }
  }

  return (
    // h-screen + overflow-hidden: el sidebar de módulos y la pantalla
    // general se desplazan de forma independiente.
    <div className="flex h-screen overflow-hidden" style={marca}>
      <OverdueModal items={briefing.items} taskCount={briefing.taskCount} ticketCount={briefing.ticketCount} />
      <Sidebar session={session} photoUrl={me?.photoUrl} hiddenModules={hiddenModules} />
      <div className="flex h-screen flex-1 flex-col">
        <Topbar
          notifications={notifications.map((n) => ({
            taskId: n.taskId,
            title: n.title,
            kind: n.kind,
            when: n.when.toISOString(),
          }))}
        />
        <main className="flex-1 overflow-y-auto bg-canvas p-6">{children}</main>
      </div>
    </div>
  );
}
