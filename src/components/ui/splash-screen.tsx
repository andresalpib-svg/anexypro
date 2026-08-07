'use client';

import { useEffect, useState } from 'react';
import { Logo } from './logo';

const DURACION_TOTAL_MS = 3000;
const DURACION_SALIDA_MS = 500;

/**
 * Cortina de arranque del login.
 *
 * Se monta ENCIMA de la pantalla de acceso —que ya está renderizando
 * debajo, así que no hay carga extra ni salto visual al retirarse—,
 * muestra el logotipo con una entrada "de adelante hacia atrás" (llega
 * grande, como si viniera hacia quien mira, y se asienta en su tamaño
 * final) y se desvanece justo después para revelar el login ya
 * definido.
 *
 * La animación de entrada (`.splash-logo` en globals.css) dura los
 * 3.0s completos que este temporizador mantiene la cortina en
 * pantalla, así que el logo se sigue moviendo todo ese tiempo — no
 * queda congelado a medio camino — y termina de asentarse justo
 * cuando arranca el fundido de salida.
 */
export function SplashScreen() {
  const [saliendo, setSaliendo] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const salir = setTimeout(() => setSaliendo(true), DURACION_TOTAL_MS);
    const ocultar = setTimeout(() => setVisible(false), DURACION_TOTAL_MS + DURACION_SALIDA_MS);
    return () => {
      clearTimeout(salir);
      clearTimeout(ocultar);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-deep-dark transition-opacity ease-out ${
        saliendo ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${DURACION_SALIDA_MS}ms` }}
    >
      <Logo className="splash-logo text-5xl" />
    </div>
  );
}
