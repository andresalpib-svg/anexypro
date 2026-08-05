'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * Pantalla para los `error.tsx` de las cuatro zonas.
 *
 * Muestra un mensaje propio y dos salidas —reintentar y volver—, en vez
 * de la pantalla genérica de Next. NO enseña el mensaje del error: en
 * producción suele venir de la base de datos o del proveedor de
 * almacenamiento y no le dice nada útil a quien administra un
 * condominio; el `digest` sí se muestra, que es lo que permite
 * encontrar el error en los registros del servidor.
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
  useEffect(() => {
    // Queda en los registros del servidor con su digest.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <AlertTriangle className="mx-auto mb-4 text-danger" size={34} />
        <p className="text-lg font-semibold text-ink">Algo salió mal</p>
        <p className="mt-2 text-sm text-muted">
          No pudimos cargar esta pantalla. Podés reintentar; si vuelve a pasar, avisá al soporte
          indicando el código de abajo.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted">Código: {error.digest}</p>
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
