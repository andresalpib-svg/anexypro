import { Lock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

/**
 * Lo que ve un supervisor o un contador cuando la empresa tiene el
 * acceso bloqueado.
 *
 * Dice explícitamente que la información se conserva. Quien se
 * encuentra la puerta cerrada asume lo peor, y esa llamada la termina
 * recibiendo la administración del condominio, que tampoco sabe.
 *
 * `isDemo` cambia el motivo: una empresa de /demo nunca está "pendiente
 * de pago" — venció su plazo de prueba. Decirle a un visitante que
 * "se comunique con el administrador principal" no tiene a quién
 * llegar.
 */
export function BlockedScreen({ rol, isDemo = false }: { rol: string; isDemo?: boolean }) {
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

          <h1 className="mt-4 text-lg font-extrabold text-ink">
            {isDemo ? 'Esta demo venció' : 'Acceso temporalmente suspendido'}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isDemo ? (
              <>Las demos de ANEXYpro duran 15 días. Esta ya venció, y el acceso de {quien} quedó suspendido.</>
            ) : (
              <>
                La suscripción de tu empresa administradora está pendiente de pago. Mientras tanto, el
                acceso de {quien} queda suspendido.
              </>
            )}
          </p>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-ok-bg/50 px-4 py-3 text-left">
            <ShieldCheck size={17} className="mt-0.5 flex-none text-ok" />
            <p className="text-sm text-ink">
              {isDemo ? (
                <>
                  <span className="font-semibold">No se perdió ninguna información.</span> Solo queda
                  bloqueada — podés crear una demo nueva cuando quieras.
                </>
              ) : (
                <>
                  <span className="font-semibold">No se perdió ninguna información.</span> Todo vuelve a
                  estar disponible en cuanto se regularice el pago.
                </>
              )}
            </p>
          </div>

          <p className="mt-5 text-sm text-muted">
            {isDemo ? (
              <Link href="/demo" className="font-semibold text-royal hover:underline">
                Crear una demo nueva
              </Link>
            ) : (
              'Comunicate con el administrador principal de tu empresa.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
