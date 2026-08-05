'use client';

import { useEffect } from 'react';

/**
 * Última red: errores que ocurren en el LAYOUT de una zona o en el
 * layout raíz.
 *
 * POR QUÉ HACE FALTA ADEMÁS DE LOS `error.tsx`: un `error.tsx` no
 * captura los errores de su propio layout, solo los de las páginas que
 * hay debajo. Se comprobó durante la auditoría: con la base de datos
 * inalcanzable, el layout del portal reventaba y salía la pantalla
 * genérica de Next —fondo blanco, texto en inglés— pese a existir
 * `portal/error.tsx`.
 *
 * Reemplaza al documento entero, así que tiene que traer sus propias
 * etiquetas `html` y `body`, y no puede apoyarse en el CSS de la
 * aplicación (el layout raíz que lo carga es justamente el que falló):
 * por eso los estilos van en línea.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f7fa',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '26rem',
            width: '100%',
            background: '#fff',
            borderRadius: '1rem',
            padding: '2rem',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(15,23,42,.08)',
          }}
        >
          <p style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
            No pudimos cargar ANEXYpro
          </p>
          <p style={{ marginTop: '.75rem', fontSize: '.875rem', color: '#64748b', lineHeight: 1.5 }}>
            Hubo un problema al iniciar la aplicación. Reintentá en unos segundos; si continúa,
            avisá al soporte indicando el código.
          </p>
          {error.digest && (
            <p style={{ marginTop: '.75rem', fontSize: '.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
              Código: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              background: '#2f5fe0',
              color: '#fff',
              border: 0,
              borderRadius: '.6rem',
              padding: '.6rem 1.25rem',
              fontSize: '.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
