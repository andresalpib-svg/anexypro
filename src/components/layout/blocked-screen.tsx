import { Lock, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

/**
 * Lo que ve un supervisor o un contador cuando la empresa tiene la
 * suscripción bloqueada.
 *
 * Dice explícitamente que la información se conserva. Quien se
 * encuentra la puerta cerrada asume lo peor, y esa llamada la termina
 * recibiendo la administración del condominio, que tampoco sabe.
 */
export function BlockedScreen({ rol }: { rol: string }) {
  const quien = rol === 'contador' ? 'contador' : 'supervisor';

  return (
    <div className="flex min-h-screen items-center justify-center bg-deep p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Logo className="text-3xl" />
        </div>

        <div className="card p-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-bg text-warn">
            <Lock size={24} />
          </span>

          <h1 className="mt-4 text-lg font-extrabold text-ink">Acceso temporalmente suspendido</h1>
          <p className="mt-2 text-sm text-muted">
            La suscripción de tu empresa administradora está pendiente de pago. Mientras tanto, el
            acceso de {quien} queda suspendido.
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-ok-bg/50 px-4 py-3 text-left">
            <ShieldCheck size={17} className="mt-0.5 flex-none text-ok" />
            <p className="text-sm text-ink">
              <span className="font-semibold">No se perdió ninguna información.</span> Todo vuelve a
              estar disponible en cuanto se regularice el pago.
            </p>
          </div>

          <p className="mt-5 text-sm text-muted">
            Comunicate con el administrador principal de tu empresa.
          </p>
        </div>
      </div>
    </div>
  );
}
