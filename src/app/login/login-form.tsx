'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/logo';

/**
 * Pantalla de acceso.
 *
 * Una sola columna centrada sobre vidrio líquido: masas de color de la
 * marca que derivan despacio detrás de una lámina translúcida. Los
 * campos van con línea inferior en vez de recuadro —menos tinta, y la
 * mirada sigue el texto y no la caja—, que es como se lee un formulario
 * cuando solo tiene dos campos.
 *
 * Los colores salen de las variables de marca, así que una empresa con
 * identidad propia vería su degradado sin tocar nada de aquí.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      // El mensaje cubre los dos motivos posibles a propósito. El
      // servidor rechaza igual una contraseña equivocada que una cuenta
      // suspendida por el master, y decir solo "contraseña incorrecta"
      // manda a quien tiene el acceso bloqueado a intentar
      // restablecerla una y otra vez en vez de llamar a quien puede
      // reactivarlo.
      setError('No pudimos iniciar sesión. Revisa el correo y la contraseña; si tu acceso fue suspendido, contacta a la administración.');
      return;
    }
    // "/" redirige según el rol (admin → /app, guarda → /seguridad,
    // condómino → /portal) — no se asume el panel Administradora.
    //
    // El destino solo se acepta si es una ruta INTERNA: un
    // `?callbackUrl=https://sitio-falso` (o `//sitio-falso`, que el
    // navegador trata como absoluta) llevaría al usuario fuera del
    // dominio justo después de autenticarse, que es el escenario
    // clásico de phishing con enlace legítimo.
    const destino = params.get('callbackUrl');
    const seguro = destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
    router.push(seguro);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-deep-dark px-5 py-10">
      {/* ---------- Fondo líquido ---------- */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/*
          El plano del condominio queda como textura del BORDE: una
          máscara radial lo desvanece hacia el centro, donde va el
          formulario. Antes ocupaba toda la pantalla y sus rótulos
          competían con los campos.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-blueprint.svg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.16]"
          style={{
            maskImage: 'radial-gradient(58% 48% at 50% 50%, transparent 30%, #000 82%)',
            WebkitMaskImage: 'radial-gradient(58% 48% at 50% 50%, transparent 30%, #000 82%)',
          }}
        />

        {/*
          Masas de color que derivan despacio. Son lo que da la lectura
          líquida: sin ellas el vidrio no tiene nada que refractar y la
          tarjeta se lee como un rectángulo azul.
        */}
        <div
          className="liquid-blob liquid-blob-a left-[-18%] top-[-22%] h-[68vmax] w-[68vmax]"
          style={{ background: 'rgb(var(--royal-rgb) / 0.55)' }}
        />
        <div
          className="liquid-blob liquid-blob-b bottom-[-26%] right-[-20%] h-[62vmax] w-[62vmax]"
          style={{ background: 'rgb(var(--lumen-rgb) / 0.42)' }}
        />
        <div
          className="liquid-blob liquid-blob-a right-[6%] top-[-10%] h-[38vmax] w-[38vmax]"
          style={{ background: 'rgb(var(--lumen-rgb) / 0.3)', animationDelay: '-9s' }}
        />
        <div
          className="liquid-blob liquid-blob-b bottom-[8%] left-[10%] h-[34vmax] w-[34vmax]"
          style={{ background: 'rgb(var(--royal-dark-rgb) / 0.38)', animationDelay: '-15s' }}
        />

        {/*
          Viñeta profunda. Es lo que hace que el vidrio se vea vidrio:
          sin un fondo oscuro alrededor, una lámina translúcida sobre
          azul medio no se distingue del azul.
        */}
        <div className="absolute inset-0 bg-[radial-gradient(80%_65%_at_50%_50%,transparent_10%,rgb(3_8_20/0.72)_75%,rgb(3_8_20/0.92))]" />
      </div>

      {/* ---------- Tarjeta ---------- */}
      <div className="relative z-10 w-full max-w-[460px]">
        <div className="mb-9 flex justify-center">
          <Logo className="text-4xl" />
        </div>

        <div className="liquid-glass liquid-sheen relative rounded-[28px] px-8 py-9 sm:px-10">
          <h1 className="text-center font-sans text-[1.6rem] font-bold leading-tight text-white">
            Bienvenido de nuevo
          </h1>
          <p className="mt-1.5 text-center text-sm text-white/60">
            Consulta fácil. Vive en comunidad.
          </p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-7">
            <div>
              <label htmlFor="email" className="liquid-label">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                className="liquid-field"
                placeholder="tucorreo@anexypro.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="liquid-label">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="liquid-field pr-11"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 rounded-xl p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {params.get('expirada') === '1' && !error && (
              <p className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/85 backdrop-blur">
                Cerramos tu sesión por 20 minutos de inactividad. Vuelve a ingresar para continuar.
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-sm font-medium text-white backdrop-blur">
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} className="liquid-button group !mt-9">
              <span className="inline-flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Ingresando…
                  </>
                ) : (
                  <>
                    Iniciar sesión
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>
          </form>
        </div>

        <p className="mt-7 text-center text-xs leading-relaxed text-white/45">
          ¿Problemas para ingresar? Contacta a la administración de tu condominio.
        </p>
      </div>
    </div>
  );
}
