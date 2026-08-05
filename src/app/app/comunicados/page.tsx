import Link from 'next/link';
import { Plus, Mail } from 'lucide-react';
import { auth } from '@/lib/auth';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession } from '@/lib/services/condominiums';
import { listCommunications } from '@/lib/services/communications';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/status-chip';
import { CondoSelect } from '../propiedades/condo-select';
import { audienceLabel } from '@/lib/comm-audience';

const STATUS_LABEL: Record<string, string> = { borrador: 'Borrador', programado: 'Programado', enviado: 'Enviado' };
const STATUS_VARIANT: Record<string, 'neutral' | 'warn' | 'ok'> = { borrador: 'neutral', programado: 'warn', enviado: 'ok' };
const CATEGORY_LABEL: Record<string, string> = {
  aviso: 'Aviso',
  noticia: 'Noticia',
  urgente: 'Urgente',
  mantenimiento: 'Mantenimiento',
  asamblea: 'Asamblea',
  recordatorio_pago: 'Recordatorio de pago',
  suspension: 'Suspensión',
};

export default async function ComunicadosPage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  const comms = condoId ? await listCommunications(session!.user.companyId, condoId) : [];

  return (
    <div>
      <PageHeader
        title="Comunicados"
        subtitle="Avisos, noticias y circulares para tus residentes"
        action={
          condoId && (
            <Link href={`/app/comunicados/nuevo?condoId=${condoId}`} className="btn-primary">
              <Plus size={16} /> Nuevo comunicado
            </Link>
          )
        }
      />

      {condos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          Primero crea un condominio en Gestión de Condominios.
        </div>
      ) : (
        <>
          <CondoSelect condos={condos} selected={condoId!} />

          <div className="card mt-5 divide-y divide-line">
            {comms.length === 0 ? (
              <div className="p-10 text-center text-muted">
                <Mail className="mx-auto mb-2 text-muted" size={22} />
                Sin comunicados todavía en este condominio.
              </div>
            ) : (
              comms.map((c) => (
                <Link key={c.id} href={`/app/comunicados/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-canvas">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{c.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {CATEGORY_LABEL[c.category]} · {c.sentAt ? new Date(c.sentAt).toLocaleDateString('es-CR') : 'sin enviar'} ·{' '}
                      <span className="font-semibold text-royal">
                        {c.status === 'enviado' ? 'Enviado a' : 'Dirigido a'}: {audienceLabel(c.targets)}
                      </span>
                    </p>
                  </div>
                  <span className="flex-none text-xs text-muted">{c._count.recipients} destinatario(s)</span>
                  <StatusChip variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
