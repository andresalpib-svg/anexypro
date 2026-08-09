import { Fragment } from 'react';
import { Home } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listPropertiesByCondo, listResidentsByCondo } from '@/lib/services/properties';
import { listProvisionableResidents } from '@/lib/services/user-provisioning';
import { isEmailConfigured } from '@/lib/email';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from './condo-select';
import { NewPropertyForm } from './new-property-form';
import { ImportExcelForm } from './import-excel-form';
import { ProvisionUsersForm } from './provision-users-form';
import { ResidentRow } from './resident-row';

const TYPE_LABEL: Record<string, string> = {
  casa: 'Casa',
  apartamento: 'Apartamento',
  local: 'Local',
  lote: 'Lote',
  parqueo: 'Parqueo',
  bodega: 'Bodega',
};

export default async function PropiedadesPage({
  searchParams,
}: {
  searchParams: { condoId?: string };
}) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const [properties, residents, provisionable] = condoId
    ? await Promise.all([
        listPropertiesByCondo(session!.user.companyId, condoId),
        listResidentsByCondo(session!.user.companyId, condoId),
        listProvisionableResidents(session!.user.companyId, condoId),
      ])
    : [[], [], []];

  return (
    <div>
      <PageHeader
        title="Propiedades y Residentes"
        menu={<ModuleActions module="/app/propiedades" />}
        subtitle="Unidades y su gente en un solo lugar — alta manual o importación por Excel"
      />

      {condos.length === 0 ? (
        <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <CondoSelect condos={condos} selected={condoId!} />
            <span id="importar-excel" className="scroll-mt-24 rounded-lg transition-all">
              <ImportExcelForm condominiumId={condoId!} />
            </span>
          </div>

          <NewPropertyForm condominiumId={condoId!} />

          {/*
            UNA sola tabla. Antes había dos —"Unidades" con la columna
            Propietario y "Residentes" con la columna Unidad—, así que
            cada propietario aparecía dos veces y había que leer las dos
            para saber quién vive dónde. Ahora cada persona cuelga de su
            unidad y aparece una única vez.
          */}
          <p className="mb-2 mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
            <Home size={14} /> Unidades ({properties.length}) y residentes ({residents.length})
          </p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Unidad / Residente</th>
                  <th className="px-4 py-3">Tipo / Rol</th>
                  <th className="px-4 py-3">Cédula</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      <Home className="mx-auto mb-2 text-muted" size={22} />
                      Sin unidades registradas todavía en este condominio.
                    </td>
                  </tr>
                ) : (
                  properties.map((p) => {
                    const suyos = residents.filter((m) => m.property.id === p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-b border-line bg-canvas/60">
                          <td className="px-4 py-2.5 font-bold text-ink">
                            <a href={`/app/propiedades/${p.id}`} className="hover:text-royal hover:underline">
                              {p.code}
                            </a>
                          </td>
                          <td className="px-4 py-2.5 text-muted">{TYPE_LABEL[p.propertyType]}</td>
                          <td className="px-4 py-2.5 text-muted">
                            {p.parkingSpaces} parqueo{p.parkingSpaces === 1 ? '' : 's'}
                          </td>
                          <td className="px-4 py-2.5 text-muted" colSpan={2}>
                            {suyos.length === 0
                              ? 'Sin residentes registrados'
                              : `${suyos.length} persona${suyos.length === 1 ? '' : 's'}`}
                          </td>
                        </tr>
                        {suyos.map((m) => (
                          <ResidentRow
                            key={m.id}
                            resident={{
                              memberId: m.id,
                              role: m.role,
                              person: {
                                id: m.person.id,
                                fullName: m.person.fullName,
                                idNumber: m.person.idNumber,
                                email: m.person.email,
                                phone: m.person.phone,
                              },
                              property: { id: m.property.id, code: m.property.code },
                            }}
                          />
                        ))}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {session!.user.role === 'admin_owner' && (
            <div id="usuarios-condominos" className="scroll-mt-24 transition-all">
            <ProvisionUsersForm
                condominiumId={condoId!}
                pendingCount={provisionable.length}
                emailConfigured={isEmailConfigured()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
