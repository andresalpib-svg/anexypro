'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Copy, Check } from 'lucide-react';

/**
 * Pantalla para los `error.tsx` de las cuatro zonas.
 *
 * Muestra un mensaje propio y dos salidas —reintentar y volver—, en vez
 * de la pantalla genérica de Next.
 *
 * QUÉ SE ENSEÑA Y QUÉ NO. En producción el mensaje del error suele
 * venir de la base o del proveedor de almacenamiento y no le dice nada
 * útil a quien administra un condominio; además puede filtrar nombres
 * de tabla. Por eso solo se muestra el `digest`, que es la única llave
 * para encontrar el error en los registros del SERVIDOR (en Vercel,
 * Runtime Logs). En desarrollo sí se muestra el mensaje completo:
 * ahí quien mira la pantalla es quien programa.
 *
 * El código va con botón de copiar a propósito. Es un número de nueve
 * cifras y antes había que transcribirlo a mano para reportarlo — un
 * dígito mal copiado y el registro no aparece.
 */
export function ErrorPantalla({
  error,
  reset,
  volverA,
  volverTexto,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  volverA: string;
  volverTexto: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const enDesarrollo = process.env.NODE_ENV === 'development';

  useEffect(() => {
    // OJO: esto corre en el NAVEGADOR, no en el servidor — sirve para
    // verlo en la consola del inspector. El registro del servidor lo
    // escribe Next por su cuenta, con este mismo digest.
    console.error(error);
  }, [error]);

  const copiar = async () => {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles el código sigue visible y se puede
      // seleccionar a mano.
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-6">
      <div className="card w-full max-w-md p-6 text-center sm:p-8">
        <AlertTriangle className="mx-auto mb-4 text-danger" size={34} />
        <p className="text-lg font-semibold text-ink">Algo salió mal</p>
        <p className="mt-2 text-sm text-muted">
          No pudimos cargar esta pantalla. Podés reintentar; si vuelve a pasar, avisá al soporte
          indicando el código de abajo.
        </p>

        {error.digest && (
          <button
            type="button"
            onClick={copiar}
            title="Copiar el código"
            className="mx-auto mt-3 flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-muted transition hover:bg-canvas hover:text-ink"
          >
            {copiado ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
            {copiado ? 'Código copiado' : `Código: ${error.digest}`}
          </button>
        )}

        {enDesarrollo && error.message && (
          <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-left font-mono text-[.7rem] leading-relaxed text-danger">
            {error.message}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Reintentar
          </button>
          <Link href={volverA} className="btn-ghost">
            {volverTexto}
          </Link>
        </div>
      </div>
    </div>
  );
}
