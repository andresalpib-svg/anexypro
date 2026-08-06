import { Building2, Home, Users } from 'lucide-react';
import { prisma, forEachCompany } from '@/lib/db';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { HealthBanner } from '@/components/layout/health-banner';

const STATUS_LABEL: Record<string, string> = { activa: 'Activa', suspendida: 'Suspendida', inactiva: 'Inactiva' };
const STATUS_VARIANT: Record<string, 'ok' | 'warn' | 'neutral'> = { activa: 'ok', suspendida: 'warn', inactiva: 'neutral' };

/**
 * Vista de plataforma: TODAS las empresas administradoras del sistema.
 * Solo el rol master llega aquí (middleware + layout lo garantizan).
 */
export default async function MasterPage() {
  // `companies` y `users` no llevan RLS; los condominios y las unidades
  // sí, así que se cuentan empresa por empresa con su propio contexto.
  // El master mira la plataforma entera, pero la mira de una empresa a
  // la vez: no hay forma de consultar por encima del aislamiento.
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { users: true } } },
  });

  const porEmpresa = await forEachCompany(async (tx) => ({
    condominios: await tx.condominium.count({ where: { deletedAt: null } }),
    unidades: await tx.property.count(),
  }));
  const conteo = new Map(porEmpresa.map((x) => [x.companyId, x.result]));

  const totals = [
    porEmpresa.reduce((n, x) => n + x.result.condominios, 0),
    porEmpresa.reduce((n, x) => n + x.result.unidades, 0),
    await prisma.user.count(),
  ];

  return (
    <div>
      <PageHeader
        title="Plataforma ANEXYpro"
        subtitle="Todas las empresas administradoras registradas en el sistema"
      />

      {/* Lo que encontró la revisión automática de hoy, si encontró algo. */}
      <HealthBanner />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: Building2, label: 'Condominios en la plataforma', value: totals[0] },
          { icon: Home, label: 'Unidades totales', value: totals[1] },
          { icon: Users, label: 'Usuarios totales', value: totals[2] },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-royal-soft text-royal">
              <Icon size={19} />
            </span>
            <p className="mt-3 text-2xl font-extrabold text-ink">{value}</p>
            <p className="text-sm text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* overflow-x-auto y no overflow-hidden: en una tablet la tabla es
          más ancha que la pantalla, y oculta recortaba las columnas sin
          dejar forma de verlas. */}
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Empresa administradora</th>
              <th className="px-4 py-3">Condominios</th>
              <th className="px-4 py-3">Usuarios</th>
              <th className="px-4 py-3">Registrada</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-ink">{c.tradeName ?? c.legalName}</p>
                  <p className="text-xs text-muted">{c.email ?? c.legalName}</p>
                </td>
                <td className="px-4 py-3 text-muted">{conteo.get(c.id)?.condominios ?? 0}</td>
                <td className="px-4 py-3 text-muted">{c._count.users}</td>
                <td className="px-4 py-3 text-muted">{new Date(c.createdAt).toLocaleDateString('es-CR')}</td>
                <td className="px-4 py-3">
                  <StatusChip variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted">
        El rol master ve la plataforma completa pero no opera dentro de las empresas — cada
        administradora gestiona sus condominios con sus propios usuarios.
      </p>
    </div>
  );
}
