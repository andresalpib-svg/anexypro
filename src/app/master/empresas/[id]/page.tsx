import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Home, Users } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getCompany } from '@/lib/services/platform';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CompanyEditor } from './company-editor';
import { AdminList } from './admin-list';

export const dynamic = 'force-dynamic';

export default async function EmpresaPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user.role !== 'master') notFound();

  const empresa = await getCompany(params.id);
  if (!empresa) notFound();

  return (
    <div>
      <Link href="/master/empresas" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-royal">
        <ArrowLeft size={15} /> Volver a empresas
      </Link>

      <PageHeader
        title={empresa.tradeName ?? empresa.legalName}
        subtitle={empresa.tradeName ? empresa.legalName : undefined}
        action={
          <StatusChip variant={empresa.status === 'activa' ? 'ok' : 'warn'}>
            {empresa.status === 'activa' ? 'Activa' : empresa.status}
          </StatusChip>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Dato icon={Building2} label="Condominios" valor={empresa.condominios} />
        <Dato icon={Home} label="Unidades" valor={empresa.unidades} />
        <Dato icon={Users} label="Usuarios" valor={empresa.usuarios.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CompanyEditor
          empresa={{
            id: empresa.id,
            legalName: empresa.legalName,
            tradeName: empresa.tradeName,
            taxId: empresa.taxId,
            email: empresa.email,
            phone: empresa.phone,
            brandPrimary: empresa.brandPrimary,
            brandDeep: empresa.brandDeep,
            logoUrl: empresa.logoUrl,
            status: empresa.status,
          }}
        />
        <AdminList
          companyId={empresa.id}
          usuarios={empresa.usuarios.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            role: u.role,
            status: u.status,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          }))}
        />
      </div>
    </div>
  );
}

function Dato({ icon: Icon, label, valor }: { icon: typeof Building2; label: string; valor: number }) {
  return (
    <div className="card p-4">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon size={13} /> {label}
      </span>
      <p className="mt-1 text-2xl font-extrabold text-ink">{valor}</p>
    </div>
  );
}
