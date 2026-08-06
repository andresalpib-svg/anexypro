import { auth } from '@/lib/auth';
import { getResidentContext } from '@/lib/services/resident-context';
import { withTenantContext } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { ChangePasswordCard } from '@/components/ui/change-password-card';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { updateResidentPhotoAction } from '@/lib/actions/profile-photo';

export default async function ResidentProfilePage() {
  const session = await auth();
  const ctx = await getResidentContext(session!.user.id);
  if (!ctx) return null;

  const [vehicles, pets, emergencyContacts] = await Promise.all([
    withTenantContext(session!.user.companyId, (tx) =>
      tx.vehicle.findMany(  { where: { propertyId: ctx.property.id } })
    ),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.pet.findMany(  { where: { propertyId: ctx.property.id } })
    ),
    withTenantContext(session!.user.companyId, (tx) =>
      tx.emergencyContact.findMany(  { where: { propertyId: ctx.property.id } })
    ),
  ]);

  return (
    <div>
      <PageHeader title="Mi Perfil" subtitle={ctx.person.fullName} />

      <div className="card mb-4 p-5">
        <PhotoUpload action={updateResidentPhotoAction} photoUrl={ctx.person.photoUrl} name={ctx.person.fullName} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Datos personales</p>
          <dl className="space-y-2 text-sm">
            <Row label="Nombre" value={ctx.person.fullName} />
            <Row label="Correo" value={ctx.person.email ?? '—'} />
            <Row label="Teléfono" value={ctx.person.phone ?? '—'} />
            <Row label="Unidad" value={ctx.property.code} />
            <Row label="Condominio" value={ctx.condominium.name} />
            <Row label="Rol" value={ctx.role} />
          </dl>
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Vehículos</p>
          {vehicles.length === 0 ? (
            <p className="text-sm text-muted">Sin vehículos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink">
              {vehicles.map((v) => (
                <li key={v.id}>
                  {v.plate} {v.brand && `· ${v.brand}`}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Mascotas</p>
          {pets.length === 0 ? (
            <p className="text-sm text-muted">Sin mascotas registradas.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink">
              {pets.map((p) => (
                <li key={p.id}>
                  {p.name} · {p.species}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Contactos de emergencia</p>
          {emergencyContacts.length === 0 ? (
            <p className="text-sm text-muted">Sin contactos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm text-ink">
              {emergencyContacts.map((c) => (
                <li key={c.id}>
                  {c.name} · {c.phone}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ChangePasswordCard />
      </div>

      <p className="mt-4 text-xs text-muted">
        Para actualizar tus datos, vehículos o mascotas, contacta a la administración de tu condominio
        — la edición directa desde este perfil queda para una próxima pasada.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
