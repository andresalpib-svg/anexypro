import Link from 'next/link';
import { Plus, Building2 } from 'lucide-react';
import { auth } from '@/lib/auth';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { PageHeader } from '@/components/ui/page-header';
import { ModuleActions } from '@/components/ui/module-actions';
import { StatusChip } from '@/components/ui/status-chip';

const STATUS_LABEL: Record<string, string> = {
  configuracion: 'En configuración',
  activo: 'Activo',
  inactivo: 'Inactivo',
};
const STATUS_VARIANT: Record<string, 'ok' | 'warn' | 'neutral'> = {
  configuracion: 'warn',
  activo: 'ok',
  inactivo: 'neutral',
};
const TYPE_LABEL: Record<string, string> = {
  residencial: 'Residencial',
  vertical: 'Vertical',
  mixto: 'Mixto',
  comercial: 'Comercial',
};

export default async function CondominiosPage() {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);

  return (
    <div>
      <PageHeader
        title="Gestión de Condominios"
        menu={<ModuleActions module="/app/condominios" />}
        subtitle={`${condos.length} condominio${condos.length === 1 ? '' : 's'} administrado${condos.length === 1 ? '' : 's'}`}
        action={
          // Solo el titular da de alta condominios — igual que en la acción.
          session?.user.role === 'admin_owner' ? (
            <Link href="/app/condominios/nuevo" className="btn-primary">
              <Plus size={16} /> Nuevo condominio
            </Link>
          ) : null
        }
      />

      {condos.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-14 text-center">
          <Building2 className="text-muted" size={32} />
          <p className="text-sm text-muted">
            Todavía no administras ningún condominio. Crea el primero para empezar a configurar
            propiedades, amenidades y parámetros financieros.
          </p>
          <Link href="/app/condominios/nuevo" className="btn-primary mt-2">
            <Plus size={16} /> Crear el primer condominio
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {condos.map((c) => (
            <Link
              key={c.id}
              href={`/app/condominios/${c.id}`}
              className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-sans text-base font-bold text-ink">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.code} · {TYPE_LABEL[c.type]}
                  </p>
                </div>
                <StatusChip variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span>{c._count.properties} unidades</span>
                <span>{c.currency}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
