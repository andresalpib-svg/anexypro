'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { enTransicion } from '@/lib/accion-segura';
import { crearDemoAction, type CrearDemoResultado } from './actions';

const ROLE_INFO: Record<string, { label: string; portal: string; blurb: string }> = {
  admin_owner: { label: 'Administrador', portal: 'Panel Administradora', blurb: 'Finanzas, condominios, reportes — acceso completo.' },
  admin_staff: { label: 'Supervisor', portal: 'Panel Administradora', blurb: 'Tareas y mantenimiento, sin acceso a finanzas.' },
  seguridad: { label: 'Seguridad', portal: 'Caseta', blurb: 'Control de accesos, visitas y paquetería.' },
  condomino: { label: 'Residente', portal: 'Portal del Condómino', blurb: 'Estado de cuenta, reservas y avisos.' },
};

/**
 * Página pública /demo — una columna centrada sobre el mismo fondo
 * líquido del login, para que se sienta parte de la misma marca.
 *
 * Un clic crea una empresa real y aislada (ver `createDemoCompany`),
 * la siembra con datos, y devuelve una cuenta por cada uno de los 4
 * roles operativos. Vence en 15 días; el propio sistema la bloquea
 * después — no hay nada que el visitante deba limpiar.
 */
export function DemoRequest() {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<CrearDemoResultado | null>(null);

  function crear() {
    enTransicion(startTransition, async () => {
      const r = await crearDemoAction();
      setResultado(r);
    });
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-deep-dark px-5 py-14">
      <div aria-hidden className="pointer-events-none absolute inset-0">
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
        <div className="liquid-blob liquid-blob-a left-[-18%] top-[-22%] h-[68vmax] w-[68vmax]" style={{ background: 'rgb(var(--royal-rgb) / 0.55)' }} />
        <div className="liquid-blob liquid-blob-b bottom-[-26%] right-[-20%] h-[62vmax] w-[62vmax]" style={{ background: 'rgb(var(--lumen-rgb) / 0.42)' }} />
        <div className="absolute inset-0 bg-[radial-gradient(80%_65%_at_50%_50%,transparent_10%,rgb(3_8_20/0.72)_75%,rgb(3_8_20/0.92))]" />
      </div>

      <div className="relative z-10 w-full max-w-[560px]">
        <div className="mb-8 flex justify-center">
          <Logo className="text-[2.5rem]" />
        </div>

        {!resultado?.ok && (
          <div className="text-center">
            <h1 className="font-sans text-[1.85rem] font-bold leading-tight tracking-tight text-white">
              Probá ANEXYpro sin compromiso
            </h1>
            <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-relaxed text-white/60">
              Creamos un condominio de ejemplo —residentes, cobros, reservas, visitas— y te damos
              una cuenta para cada rol. Es tuyo por 15 días y no hace falta ninguna cuenta real.
            </p>

            <button onClick={crear} disabled={pending} className="liquid-button group !mt-9 !w-auto px-8">
              <span className="inline-flex items-center justify-center gap-2">
                {pending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Creando tu demo…
                  </>
                ) : (
                  <>
                    Crear mi demo
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </span>
            </button>

            {resultado && !resultado.ok && (
              <p className="mt-6 rounded-xl border border-danger/40 bg-danger/15 px-4 py-3 text-sm font-medium text-white backdrop-blur">
                {resultado.error}
              </p>
            )}

            <p className="mt-10 text-xs leading-relaxed text-white/40">
              Los datos son ficticios y se reinician al vencer. ¿Ya tenés una cuenta?{' '}
              <Link href="/login" className="underline decoration-white/25 underline-offset-4 hover:text-white/70">
                Iniciá sesión
              </Link>
              .
            </p>
          </div>
        )}

        {resultado?.ok && (
          <div className="relative overflow-hidden rounded-3xl liquid-glass liquid-sheen p-7 sm:p-9">
            <h1 className="text-center font-sans text-xl font-bold text-white">Tu demo está lista</h1>
            <p className="mx-auto mt-2 max-w-[38ch] text-center text-sm text-white/60">
              Vence el {new Date(resultado.expiresAt).toLocaleString('es-CR', { dateStyle: 'long', timeStyle: 'short' })}.
              Elegí un rol para entrar.
            </p>

            <div className="mt-7 space-y-3">
              {resultado.credentials.map((c) => (
                <CredentialCard key={c.role} credential={c} />
              ))}
            </div>

            <p className="mt-7 text-center text-xs leading-relaxed text-white/40">
              Guardá estas contraseñas — no vuelven a mostrarse.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function CredentialCard({ credential }: { credential: { role: string; email: string; password: string } }) {
  const [copiado, setCopiado] = useState(false);
  const info = ROLE_INFO[credential.role];

  function copiar() {
    navigator.clipboard.writeText(credential.password).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    });
  }

  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{info?.label ?? credential.role}</p>
          <p className="text-xs text-white/45">{info?.portal}</p>
        </div>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent('/')}`}
          className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10"
        >
          Iniciar sesión <ArrowRight size={13} />
        </Link>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/50">{info?.blurb}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 font-mono text-[13px]">
        <span className="truncate text-white/80">{credential.email}</span>
        <span />
        <span className="truncate text-white/80">{credential.password}</span>
        <button
          onClick={copiar}
          aria-label="Copiar contraseña"
          className="justify-self-end rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          {copiado ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
