import { Suspense } from 'react';
import { Logo } from '@/components/ui/logo';
import { SplashScreen } from '@/components/ui/splash-screen';
import { LoginForm } from './login-form';

/**
 * Dinámica a la fuerza: la CSP con nonce por petición
 * (src/middleware.ts, auditoría de seguridad 2026-08-11, hallazgo
 * #18) necesita que el HTML se genere en cada petición, con el nonce
 * de ESA petición incrustado en los scripts. Una página estática se
 * renderiza UNA vez en el build y se sirve cacheada siempre igual —
 * el nonce del build nunca coincide con el de la petición real, y el
 * navegador bloquea todos los scripts (se reprodujo en local: la
 * página cargaba en blanco, sin hidratar). Esta era una de las 3
 * únicas rutas estáticas de toda la aplicación.
 */
export const dynamic = 'force-dynamic';

/**
 * El formulario lee la URL (`callbackUrl`, `expirada`) con
 * `useSearchParams`, que obliga a envolverlo en un límite de
 * suspensión: sin él, la compilación de producción falla al
 * pre-renderizar esta página.
 *
 * El respaldo replica el fondo de marca para que no haya un salto
 * visual mientras el formulario se hidrata.
 *
 * La cortina de arranque (`SplashScreen`) se monta encima: el login
 * de abajo ya está renderizando en paralelo, así que cuando la
 * cortina se retira a los 3 segundos no hay carga ni salto, solo el
 * login ya listo.
 */
export default function LoginPage() {
  return (
    <>
      <SplashScreen />
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-deep">
            <Logo className="text-4xl" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </>
  );
}
