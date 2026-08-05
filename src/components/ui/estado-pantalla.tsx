import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Pantalla de estado a página completa: la usan los `not-found.tsx` y
 * los `error.tsx` de las cuatro zonas (panel, portal, caseta y master).
 *
 * POR QUÉ EXISTE: no había ninguna, así que un 404 o cualquier
 * excepción del servidor caían en la pantalla por defecto de Next
 * —fondo blanco, tipografía del sistema, texto en inglés— fuera del
 * marco de la aplicación y sin ninguna salida. Para quien administra un
 * condominio, eso se lee como "se rompió todo".
 */
export function EstadoPantalla({
  icon: Icon,
  titulo,
  mensaje,
  volverA,
  volverTexto = 'Volver al inicio',
  children,
}: {
  icon: LucideIcon;
  titulo: string;
  mensaje: string;
  volverA: string;
  volverTexto?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <Icon className="mx-auto mb-4 text-muted" size={34} />
        <p className="text-lg font-semibold text-ink">{titulo}</p>
        <p className="mt-2 text-sm text-muted">{mensaje}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href={volverA} className="btn-primary">
            {volverTexto}
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
