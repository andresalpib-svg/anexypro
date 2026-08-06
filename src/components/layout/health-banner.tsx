import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { revisionPendiente } from '@/lib/services/system-health';

/**
 * Aviso de la revisión automática del sistema.
 *
 * Aparece solo cuando la revisión de la madrugada encontró algo roto, y
 * se queda hasta que la revisión siguiente lo dé por resuelto. Esa es
 * toda la gracia: una credencial caducada deja de depender de que
 * alguien se acuerde de abrir el diagnóstico.
 *
 * Es un componente de SERVIDOR y hace UNA consulta a la bitácora: no
 * sale a la red ni vuelve a comprobar nada. La comprobación la hizo el
 * programador; esto solo muestra lo que anotó.
 *
 * Si la consulta falla, no devuelve nada: un aviso que rompe la
 * pantalla que venía a proteger no sirve de nada.
 */
export async function HealthBanner() {
  let pendiente = null;
  try {
    pendiente = await revisionPendiente();
  } catch {
    return null;
  }
  if (!pendiente) return null;

  // La primera línea del detalle es el titular; el resto es el
  // desglose, que vive en /master/estado.
  const titular = pendiente.detalle.split('\n')[0] ?? 'Hay servicios con falla.';
  const sinRevisar = pendiente.motivo === 'sin-revisar';

  return (
    <div
      className={`card mb-5 border-l-4 p-4 ${
        sinRevisar ? 'border-l-warn bg-warn-bg/40' : 'border-l-danger bg-danger-bg/40'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 flex-none ${sinRevisar ? 'text-warn' : 'text-danger'}`}
          size={20}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            {sinRevisar ? 'Nadie está vigilando el sistema' : 'La revisión automática encontró problemas'}
          </p>
          <p className="mt-0.5 break-words text-sm text-muted">{titular}</p>
          <p className="mt-1 text-xs text-muted">
            {pendiente.cuando
              ? `Última revisión: ${pendiente.cuando.toLocaleString('es-CR')}`
              : 'Sin ninguna revisión registrada.'}
          </p>
        </div>
        <Link href="/master/estado" className="btn-ghost py-2 text-xs">
          Comprobar ahora <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
