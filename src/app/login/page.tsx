import { Suspense } from 'react';
import { Logo } from '@/components/ui/logo';
import { LoginForm } from './login-form';

/**
 * El formulario lee la URL (`callbackUrl`, `expirada`) con
 * `useSearchParams`, que obliga a envolverlo en un límite de
 * suspensión: sin él, la compilación de producción falla al
 * pre-renderizar esta página.
 *
 * El respaldo replica el fondo de marca para que no haya un salto
 * visual mientras el formulario se hidrata.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-deep">
          <Logo className="text-4xl" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
