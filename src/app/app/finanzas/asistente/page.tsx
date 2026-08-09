import { Lock } from 'lucide-react';
import { auth } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { resolveCondoId } from '@/lib/active-condo';
import { listCondominiumsForSession, getCondominium } from '@/lib/services/condominiums';
import { assistantHasAI } from '@/lib/services/financial-assistant';
import { SUGGESTED_QUESTIONS } from '@/lib/domain/assistant-intents';
import { PageHeader } from '@/components/ui/page-header';
import { SinCondominio } from '@/components/ui/sin-condominio';
import { CondoSelect } from '../../propiedades/condo-select';
import { FinanceTabs } from '../finance-tabs';
import { AssistantChat } from './assistant-chat';

export default async function AsistentePage({ searchParams }: { searchParams: { condoId?: string } }) {
  const session = await auth();
  if (!can(session, 'finanzas')) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <Lock className="mx-auto mb-3 text-muted" size={28} />
        <p className="text-sm font-semibold text-ink">Sin acceso a Finanzas</p>
      </div>
    );
  }

  const condos = await listCondominiumsForSession(session!);
  const condoId = resolveCondoId(searchParams.condoId, condos);
  if (!condoId) return <SinCondominio companyId={session!.user.companyId} role={session!.user.role} />;

  const condo = await getCondominium(session!.user.companyId, condoId);

  return (
    <div>
      <PageHeader
        title="Finanzas y Contabilidad"
        subtitle="Asistente financiero — preguntá en español sobre los datos de tu condominio"
      />
      <FinanceTabs />
      <div className="mb-4 mt-4">
        <CondoSelect condos={condos} selected={condoId} />
      </div>

      <AssistantChat
        condominiumId={condoId}
        condoName={condo?.name ?? 'tu condominio'}
        hasAI={assistantHasAI()}
        suggestions={SUGGESTED_QUESTIONS.map((q) => q.text)}
      />
    </div>
  );
}
