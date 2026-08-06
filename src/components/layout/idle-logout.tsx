'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { AlertTriangle } from 'lucide-react';

/** Política de la plataforma: 20 minutos sin actividad cierran la sesión. */
export const IDLE_MINUTES = 20;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const WARN_MS = 60 * 1000; // último minuto: se avisa antes de cerrar

/**
 * Vigila la actividad del usuario y cierra la sesión tras
 * IDLE_MINUTES de inactividad. La sesión NO expira mientras el
 * usuario esté usando la aplicación: cualquier interacción reinicia
 * el reloj. El JWT tiene el mismo vencimiento del lado del servidor,
 * así que un usuario que deje la pestaña abierta tampoco conserva
 * acceso real.
 */
export function IdleLogout() {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(Date.now());
  const signingOut = useRef(false);

  useEffect(() => {
    const touch = () => {
      lastActivity.current = Date.now();
      setSecondsLeft((prev) => (prev === null ? prev : null)); // cancela el aviso
    };

    const events = ['mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    // Volver a la pestaña cuenta como actividad solo si el reloj no venció.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity.current < IDLE_MS) touch();
    };
    document.addEventListener('visibilitychange', onVisible);

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) {
        if (signingOut.current) return;
        signingOut.current = true;
        window.clearInterval(timer);
        signOut({ callbackUrl: '/login?expirada=1' });
      } else if (idle >= IDLE_MS - WARN_MS) {
        setSecondsLeft(Math.ceil((IDLE_MS - idle) / 1000));
      }
    }, 1000);

    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, []);

  if (secondsLeft === null) return null;

  return (
    // En un teléfono el aviso ocupa el ancho disponible dejando margen a
    // ambos lados; centrarlo con `-translate-x-1/2` lo sacaba de la
    // pantalla porque el texto y el botón no caben en 375 px.
    <div className="fixed inset-x-3 bottom-5 z-[200] flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-white px-4 py-3 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:flex-nowrap sm:-translate-x-1/2">
      <AlertTriangle className="flex-none text-warn" size={18} />
      <p className="text-sm text-ink">
        Tu sesión se cerrará en <b>{secondsLeft} s</b> por inactividad.
      </p>
      <button
        type="button"
        onClick={() => {
          lastActivity.current = Date.now();
          setSecondsLeft(null);
        }}
        className="btn-primary py-1.5 text-xs"
      >
        Seguir conectado
      </button>
    </div>
  );
}
