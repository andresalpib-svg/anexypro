import Link from 'next/link';
import { Building2, Users, Home } from 'lucide-react';
import { listCompanies } from '@/lib/services/platform';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { NewCompanyForm } from './new-company-form';

export const dynamic = 'force-dynamic';

const ESTADO: Record<string, { label: string; variant: 'ok' | 'warn' | 'neutral' }> = {
  activa: { label: 'Activa', variant: 'ok' },
  suspendida: { label: 'Suspendida', variant: 'warn' },
  inactiva: { label: 'Inactiva', variant: 'neutral' },
};

/**
 * Alta y listado de empresas administradoras.
 *
 * Es la pantalla por la que entra un cliente nuevo al sistema: crea la
 * empresa y su primer administrador de una vez, porque una empresa sin
 * administrador no le sirve a nadie.
 */
export default async function EmpresasPage() {
  const empresas = await listCompanies();

  return (
    <div>
      <PageHeader
        title="Empresas administradoras"
        subtitle="Alta de clientes, sus administradores y su identidad visual"
        action={<NewCompanyForm />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {empresas.map((e) => (
          <Link
            key={e.id}
            href={`/master/empresas/${e.id}`}
            className="card p-5 transition hover:border-royal/50"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-white"
                style={{ background: e.brandPrimary || '#3F6DF6' }}
              >
                <Building2 size={20} />
              </span>
              <div className="flex flex-col items-end gap-1.5">
                <StatusChip variant={ESTADO[e.status]?.variant ?? 'neutral'}>
                  {ESTADO[e.status]?.label ?? e.status}
                </StatusChip>
                {/* Nace y muere sola por el job `demo-vencidos` — el
                    master no debería confundirla con un cliente real. */}
                {e.isDemo && <StatusChip variant="neutral">Demo</StatusChip>}
              </div>
            </div>

            <p className="mt-3 font-bold text-ink">{e.tradeName ?? e.legalName}</p>
            {e.tradeName && <p className="text-xs text-muted">{e.legalName}</p>}
            {e.email && <p className="mt-0.5 text-xs text-muted">{e.email}</p>}

            <div className="mt-3 flex gap-4 border-t border-line pt-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Building2 size={12} /> {e.condominios} condominio{e.condominios === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1">
                <Home size={12} /> {e.unidades}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} /> {e._count.users}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {empresas.length === 0 && (
        <div className="card p-12 text-center text-sm text-muted">
          Todavía no hay empresas administradoras. Creá la primera con el botón de arriba.
        </div>
      )}
    </div>
  );
}
