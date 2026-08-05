import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { ChangePasswordCard } from '@/components/ui/change-password-card';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { updateAdminPhotoAction } from '@/lib/actions/profile-photo';

const ROLE_LABEL: Record<string, string> = {
  admin_owner: 'Administrador principal',
  admin_staff: 'Supervisor',
  contador: 'Contador externo',
};

export default async function AdminProfilePage() {
  const session = await auth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
    include: { company: { select: { legalName: true, tradeName: true } } },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Mi Perfil" subtitle={user.fullName} />

      <div className="card mb-4 p-5">
        <PhotoUpload action={updateAdminPhotoAction} photoUrl={user.photoUrl} name={user.fullName} />
      </div>

      <div className="card p-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Datos de la cuenta</p>
        <dl className="space-y-2 text-sm">
          <Row label="Nombre" value={user.fullName} />
          <Row label="Correo" value={user.email} />
          <Row label="Teléfono" value={user.phone ?? '—'} />
          <Row label="Rol" value={ROLE_LABEL[user.role] ?? user.role} />
          <Row label="Empresa administradora" value={user.company.tradeName ?? user.company.legalName} />
          <Row
            label="Último ingreso"
            value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('es-CR') : '—'}
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
      <div className="mt-4 max-w-2xl">
        <ChangePasswordCard />
      </div>
    </div>
  );
}
