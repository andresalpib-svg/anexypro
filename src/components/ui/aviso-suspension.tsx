import { AlertTriangle } from 'lucide-react';

/**
 * Aviso de servicios suspendidos por morosidad, en el lugar donde el
 * residente iba a usar el servicio.
 *
 * POR QUÉ EXISTE: el bloqueo se comprueba en el servidor (bien), pero
 * solo el Árbitro Legal lo anunciaba antes. En Visitas y Reservas el
 * residente llenaba el formulario completo y recién al enviarlo se
 * enteraba de que no podía — la información llegaba tarde y en forma
 * de error (prueba por rol del 2026-08-08).
 */
export function AvisoSuspension({
  servicio,
  monthsOverdue,
}: {
  /** Qué no puede hacer, en las palabras del residente: "reservar áreas comunes". */
  servicio: string;
  monthsOverdue: number;
}) {
  return (
    <div className="card border-danger/30 bg-danger-bg/40 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-danger">
        <AlertTriangle size={16} /> Servicios condominales suspendidos
      </p>
      <p className="mt-1 text-sm text-ink">
        Por {monthsOverdue} {monthsOverdue === 1 ? 'mes' : 'meses'} de atraso en la cuota condominal no
        podés {servicio}. Ponete al día o comunicate con la administración para revisar tu estado de
        cuenta.
      </p>
    </div>
  );
}
