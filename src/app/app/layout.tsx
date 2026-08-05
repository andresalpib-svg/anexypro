import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { isModuleHidden } from '@/lib/services/module-visibility';
import { navItemForPath, CONTADOR_MODULES } from '@/lib/nav-config';
import { can, type PermissionArea } from '@/lib/rbac';
import { getTaskNotifications } from '@/lib/services/tasks';
import { getOverdueBriefing, avisoYaVistoHoy, SIN_ATRASOS } from '@/lib/services/overdue-briefing';
import { prisma } from '@/lib/db';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { OverdueModal } from '@/components/layout/overdue-modal';
import { brandStyle } from '@/lib/branding';
import { getCompanyShell } from '@/lib/services/company-shell';
import { BlockedScreen } from '@/components/layout/blocked-screen';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !['admin_owner', 'admin_staff', 'contador'].includes(session.user.role)) {
    redirect('/login');
  }

  // El aviso de atrasos se muestra una vez al día. Si la cookie dice
  // que ya se vio, ni siquiera se calcula: son dos consultas que de
  // otro modo corrían en cada navegación para descartarse enseguida.
  const yaVioAtrasos = avisoYaVistoHoy(cookies().get('anexypro-atrasos-visto')?.value);

  const [notifications, briefing, me, empresa] = await Promise.all([
    // Alarmas de Gestión de Tareas: vencidas (obligatorio) + programadas.
    getTaskNotifications(session.user.companyId),
    // Aviso de primera instancia: pendientes con 2+ días de atraso.
    yaVioAtrasos ? Promise.resolve(SIN_ATRASOS) : getOverdueBriefing(session.user.companyId),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { photoUrl: true } }),
    // Módulos ocultos + marca + suscripción: UNA sola lectura de la
    // fila de la empresa, en vez de las tres encadenadas que había.
    getCompanyShell(session.user.companyId),
  ]);

  const { hiddenModules, brand, subscription: suscripcion } = empresa;
  // Si la empresa no tiene marca propia, `brandStyle` devuelve un
  // objeto vacío y el panel se queda con la paleta de `globals.css`.
  const marca = brandStyle(brand);

  // Bloqueo por URL: ocultar el módulo del menú no basta si el usuario
  // escribe la dirección a mano.
  const pathname = headers().get('x-pathname') ?? '';
  if (pathname && isModuleHidden(hiddenModules, pathname)) redirect('/app/dashboard');

  // Permisos por URL — las mismas reglas de nav-config que filtran el
  // menú, aplicadas a la pantalla. Sin esto, un supervisor con el área
  // apagada o el contador externo entraban a cualquier módulo
  // escribiendo la dirección.
  if (pathname) {
    if (session.user.role === 'contador') {
      // Lista blanca explícita del contador + su perfil y la pantalla
      // de suscripción (esta última decide sola qué mostrar).
      const permitido = [...CONTADOR_MODULES, '/app/perfil', '/app/suscripcion'].some(
        (m) => pathname === m || pathname.startsWith(`${m}/`)
      );
      if (!permitido) redirect('/app/finanzas');
    } else {
      const item = navItemForPath(pathname);
      if (item?.ownerOnly && session.user.role !== 'admin_owner') redirect('/app/dashboard');
      // `area` es string en nav-config (igual que en guard.ts); el
      // catálogo real de áreas vive en rbac.ts.
      if (item?.area && !can(session, item.area as PermissionArea)) redirect('/app/dashboard');
    }
  }

  // Suscripción bloqueada. El administrador entra pero solo ve la
  // pantalla de pago; el supervisor y el contador quedan fuera. No se
  // borra ni se oculta información: solo se cierra el paso.
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
      {/* pt-14 en móvil: deja sitio a la barra superior con el menú. */}
      <div className="flex h-screen flex-1 flex-col pt-14 lg:pt-0">
        <Topbar
          notifications={notifications.map((n) => ({
            taskId: n.taskId,
            title: n.title,
            kind: n.kind,
            when: n.when.toISOString(),
          }))}
        />
        <main className="flex-1 overflow-y-auto bg-canvas p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
