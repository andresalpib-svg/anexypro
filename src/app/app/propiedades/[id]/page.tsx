import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, User, Car, PawPrint, Phone } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getProperty } from '@/lib/services/properties';
import { canAccessCondo } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { InlineAddForm } from '../inline-add-form';
import { addPersonAction, addVehicleAction, addPetAction, addEmergencyContactAction, removeMemberAction } from '../resident-actions';

const ROLE_LABEL: Record<string, string> = {
  propietario: 'Propietario',
  residente: 'Residente',
  inquilino: 'Inquilino',
  familiar: 'Familiar',
  empleado: 'Empleado',
};

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const property = await getProperty(session!.user.companyId, params.id);
  if (!property) notFound();
  // El supervisor solo ve fichas de SUS condominios; escribir la URL a
  // mano no debe saltarse esa asignación (la ficha lleva cédulas y
  // contactos de residentes).
  if (!(await canAccessCondo(session!, property.condominiumId))) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={property.code}
        subtitle={`${property.condominium.name} · ${property.propertyType}`}
        action={
          <Link href="/app/propiedades" className="btn-ghost">
            <ArrowLeft size={16} /> Volver
          </Link>
        }
      />

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
            <User size={14} /> Residentes ({property.members.length})
          </p>
          <InlineAddForm
            action={addPersonAction}
            propertyId={property.id}
            triggerLabel="Agregar persona"
            buttonLabel="Guardar"
            fields={[
              { name: 'fullName', label: 'Nombre completo', width: '200px' },
              { name: 'idNumber', label: 'Cédula', width: '120px' },
              { name: 'email', label: 'Correo', type: 'email', width: '180px' },
              { name: 'phone', label: 'Teléfono', width: '130px' },
              { name: 'password', label: 'Contraseña (opcional — crea el usuario)', type: 'password', width: '190px' },
              {
                name: 'role',
                label: 'Rol',
                type: 'select',
                width: '140px',
                options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
              },
            ]}
          />
        </div>
        {property.members.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Sin residentes registrados todavía.</p>
        ) : (
          <ul className="divide-y divide-line">
            {property.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="font-medium text-ink">{m.person.fullName}</span>
                <StatusChip variant="royal">{ROLE_LABEL[m.role]}</StatusChip>
                {m.person.phone && <span className="text-muted">{m.person.phone}</span>}
                <form action={removeMemberAction.bind(null, m.id, property.id)} className="ml-auto">
                  <button type="submit" className="text-xs text-muted hover:text-danger">
                    Dar de baja
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
            <Car size={14} /> Vehículos ({property.vehicles.length})
          </p>
          <InlineAddForm
            action={addVehicleAction}
            propertyId={property.id}
            triggerLabel="Agregar vehículo"
            buttonLabel="Guardar"
            fields={[
              { name: 'plate', label: 'Placa', width: '110px' },
              { name: 'brand', label: 'Marca', width: '130px' },
              { name: 'color', label: 'Color', width: '110px' },
              {
                name: 'vehicleType',
                label: 'Tipo',
                type: 'select',
                width: '140px',
                options: [
                  { value: 'automovil', label: 'Automóvil' },
                  { value: 'motocicleta', label: 'Motocicleta' },
                  { value: 'bicicleta', label: 'Bicicleta' },
                  { value: 'otro', label: 'Otro' },
                ],
              },
            ]}
          />
        </div>
        {property.vehicles.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Sin vehículos registrados.</p>
        ) : (
          <ul className="divide-y divide-line">
            {property.vehicles.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono font-semibold text-ink">{v.plate}</span>
                <span className="text-muted">
                  {[v.brand, v.color].filter(Boolean).join(' · ') || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <PawPrint size={14} /> Mascotas ({property.pets.length})
            </p>
          </div>
          <InlineAddForm
            action={addPetAction}
            propertyId={property.id}
            triggerLabel="Agregar mascota"
            buttonLabel="Guardar"
            fields={[
              { name: 'name', label: 'Nombre', width: '120px' },
              {
                name: 'species',
                label: 'Especie',
                type: 'select',
                width: '110px',
                options: [
                  { value: 'perro', label: 'Perro' },
                  { value: 'gato', label: 'Gato' },
                  { value: 'ave', label: 'Ave' },
                  { value: 'otro', label: 'Otro' },
                ],
              },
            ]}
          />
          <ul className="mt-2 divide-y divide-line">
            {property.pets.map((p) => (
              <li key={p.id} className="py-2 text-sm text-ink">
                {p.name} <span className="text-muted">· {p.species}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <Phone size={14} /> Emergencia ({property.emergencyContacts.length})
            </p>
          </div>
          <InlineAddForm
            action={addEmergencyContactAction}
            propertyId={property.id}
            triggerLabel="Agregar contacto"
            buttonLabel="Guardar"
            fields={[
              { name: 'name', label: 'Nombre', width: '130px' },
              { name: 'phone', label: 'Teléfono', width: '110px' },
            ]}
          />
          <ul className="mt-2 divide-y divide-line">
            {property.emergencyContacts.map((c) => (
              <li key={c.id} className="py-2 text-sm text-ink">
                {c.name} <span className="text-muted">· {c.phone}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
