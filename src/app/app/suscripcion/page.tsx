import { redirect } from 'next/navigation';
import { CreditCard, ShieldCheck, Mail, Phone } from 'lucide-react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCompanySubscription } from '@/lib/services/subscriptions';
import { Logo } from '@/components/ui/logo';

export const dynamic = 'force-dynamic';

/**
 * Pantalla de suscripción vencida.
 *
 * Es lo único que ve el administrador de una empresa bloqueada. No
 * lleva barra lateral ni menú a propósito: no hay nada que hacer aquí
 * salvo entender qué pasó y a quién llamar.
 *
 * Insiste en que la información está intacta porque es la primera
 * pregunta de quien se encuentra la puerta cerrada.
 */
export default async function SuscripcionPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const estado = await getCompanySubscription(session.user.companyId);
  // Si no está bloqueada, esta pantalla no tiene sentido.
  if (!estado.blocked) redirect('/app/dashboard');

  const empresa = await prisma.company.findUnique({
    where: { id: session.user.companyId },
    select: { legalName: true, tradeName: true, blockReason: true, plan: { select: { name: true } } },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Logo className="text-3xl" />
        </div>

        <div className="card p-8">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-bg text-warn">
            <CreditCard size={26} />
          </span>

          <h1 className="mt-4 text-center text-xl font-extrabold text-ink">Suscripción pendiente de pago</h1>
          <p className="mt-2 text-center text-sm text-muted">
            El acceso de {empresa?.tradeName ?? empresa?.legalName ?? 'tu empresa'} está temporalmente
            suspendido{empresa?.plan?.name ? ` (plan ${empresa.plan.name})` : ''}.
          </p>

          {empresa?.blockReason && (
            <p className="mt-4 rounded-xl bg-canvas px-4 py-3 text-sm text-ink">{empresa.blockReason}</p>
          )}

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-ok-bg/50 px-4 py-3">
            <ShieldCheck size={18} className="mt-0.5 flex-none text-ok" />
            <p className="text-sm text-ink">
              <span className="font-semibold">Tu información está completa y a salvo.</span> No se
              eliminó nada: residentes, finanzas, documentos y expedientes vuelven a estar disponibles
              en cuanto se registre el pago.
            </p>
          </div>

          <div className="mt-6 border-t border-line pt-5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Para regularizar</p>
            <p className="mt-2 text-sm text-ink">
              Comunicate con ANEXYpro para registrar el pago y restablecer el acceso de inmediato.
            </p>
            <div className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
              <span className="flex items-center gap-2">
                <Mail size={14} /> soporte@anexypro.com
              </span>
              <span className="flex items-center gap-2">
                <Phone size={14} /> +506 0000-0000
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-white/50">
          Ingresaste como {session.user.name ?? session.user.email}.
        </p>
      </div>
    </div>
  );
}
