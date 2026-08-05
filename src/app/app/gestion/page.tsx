import { auth } from '@/lib/auth';
import { listTasksForSession, listAdminUsers } from '@/lib/services/tasks';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { TaskBoard } from './task-board';

// dueDate es @db.Date (medianoche UTC): se lee el día calendario en UTC
// para no correrse un día por zona horaria.
function toDateInput(d: Date | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

// alarmAt es un instante real: se muestra en hora local.
function toDateTimeInput(d: Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export default async function GestionPage() {
  const session = await auth();
  // El supervisor solo ve sus tareas y sus condominios; la
  // administración ve todo.
  const [tasks, users, condos] = await Promise.all([
    listTasksForSession(session!),
    listAdminUsers(session!.user.companyId),
    listCondominiumsForSession(session!),
  ]);
  const canAssign = session!.user.role === 'admin_owner';

  return (
    <div>
      <PageHeader title="Gestión de Tareas" subtitle={canAssign ? 'El tablero interno de tu equipo — con checklist, adjuntos y alarmas' : 'Tus tareas asignadas y las que creaste'} />
      <TaskBoard
        users={users}
        condos={condos.map((c) => ({ id: c.id, name: c.name }))}
        canAssign={canAssign}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          assignedToId: t.assignedToId,
          assignedToName: t.assignedTo?.fullName ?? null,
          condominiumId: t.condominiumId,
          condominiumName: t.condominium?.name ?? null,
          priority: t.priority,
          dueDate: toDateInput(t.dueDate),
          alarmAt: toDateTimeInput(t.alarmAt),
          notes: t.notes,
          status: t.status,
          checklist: t.checklist.map((c) => ({ id: c.id, title: c.title, done: c.done })),
          attachments: t.attachments.map((a) => ({ id: a.id, fileName: a.fileName, fileUrl: a.fileUrl })),
        }))}
      />
    </div>
  );
}
