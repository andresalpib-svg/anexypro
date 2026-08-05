'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { fijarPasswordAction, type FijarState } from '@/app/recuperar/actions';

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="liquid-button group !mt-9">
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Guardando…
          </>
        ) : (
          <>
            Guardar contraseña
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </button>
  );
}

export function FijarForm({ token, nombre }: { token: string; nombre: string }) {
  const [state, formAction] = useFormState<FijarState, FormData>(fijarPasswordAction, {});
  const [ver, setVer] = useState(false);

  if (state.ok) {
    return (
      <div className="text-center">
        <Check className="mx-auto mb-4 text-ok" size={34} />
        <h1 className="font-sans text-[1.75rem] font-bold leading-tight tracking-tight text-white">
          Contraseña actualizada
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Ya podés ingresar con tu contraseña nueva.
        </p>
        <p className="mt-8">
          <Link href="/login" className="liquid-button inline-block !w-auto px-8">
            Ir al acceso
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-center font-sans text-[1.75rem] font-bold leading-tight tracking-tight text-white">
        Elegí tu contraseña
      </h1>
      <p className="mt-2 text-center text-sm text-white/55">
        Hola {nombre}. Escribila dos veces para confirmar que no hubo un error de tecleo.
      </p>

      <form action={formAction} className="mt-11 space-y-7">
        <input type="hidden" name="token" value={token} />

        <div>
          <label htmlFor="password" className="liquid-label">
            Contraseña nueva
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={ver ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              className="liquid-field pr-11"
              placeholder="Al menos 8 caracteres"
            />
            <button
              type="button"
              aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              onClick={() => setVer((v) => !v)}
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-xl p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
            >
              {ver ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="password2" className="liquid-label">
            Repetí la contraseña
          </label>
          <input
            id="password2"
            name="password2"
            type={ver ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            className="liquid-field"
            placeholder="La misma de arriba"
          />
        </div>

        {state.error && (
          <p className="rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-sm font-medium text-white backdrop-blur">
            {state.error}
          </p>
        )}

        <Boton />
      </form>
    </>
  );
}
