'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { CAMPO_TRAMPA, CAMPO_RENDERIZADO } from '@/lib/bot-protection';
import { solicitarEnlaceAction, type SolicitudState } from './actions';

function Boton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="liquid-button group !mt-9">
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Enviando…
          </>
        ) : (
          <>
            Enviar enlace
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </span>
    </button>
  );
}

export function SolicitudForm() {
  const [state, formAction] = useFormState<SolicitudState, FormData>(solicitarEnlaceAction, {});
  // Antibot — ver src/lib/bot-protection.ts. useState(() => ...) para
  // que la hora quede fija desde el primer render.
  const [renderizadoEn] = useState(() => Date.now());

  if (state.enviado) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto mb-4 text-white/70" size={34} />
        <h1 className="font-sans text-[1.75rem] font-bold leading-tight tracking-tight text-white">
          Revisá tu correo
        </h1>
        {/*
          El mensaje es el mismo exista o no la cuenta: si dijera "ese
          correo no está registrado", esta pantalla sería un buscador de
          usuarios del sistema.
        */}
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Si ese correo corresponde a una cuenta activa, te enviamos un enlace para elegir una
          contraseña nueva. Vence en 30 minutos.
        </p>
        <p className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/60"
          >
            <ArrowLeft size={15} /> Volver al acceso
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-center font-sans text-[1.75rem] font-bold leading-tight tracking-tight text-white">
        Restablecer contraseña
      </h1>
      <p className="mt-2 text-center text-sm text-white/55">
        Escribí tu correo y te enviamos un enlace para elegir una nueva.
      </p>

      <form action={formAction} className="mt-11 space-y-7">
        {/* Campo trampa + hora de renderizado — ver src/lib/bot-protection.ts. */}
        <input
          type="text"
          name={CAMPO_TRAMPA}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />
        <input type="hidden" name={CAMPO_RENDERIZADO} value={renderizadoEn} />

        <div>
          <label htmlFor="email" className="liquid-label">
            Correo electrónico
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="liquid-field"
            placeholder="tucorreo@anexypro.com"
          />
        </div>

        {state.error && (
          <p className="rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-sm font-medium text-white backdrop-blur">
            {state.error}
          </p>
        )}

        <Boton />

        <p className="!mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70 underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/60"
          >
            <ArrowLeft size={15} /> Volver al acceso
          </Link>
        </p>
      </form>
    </>
  );
}
