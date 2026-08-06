'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ejecutar, enTransicion } from '@/lib/accion-segura';
import { removeMemberAction } from './resident-actions';

/**
 * "Dar de baja" del detalle de la unidad.
 *
 * Antes era un `<form action={removeMemberAction.bind(...)}>` dentro de
 * un componente de servidor: sin confirmación —un clic de más daba de
 * baja al residente— y sin forma de mostrar el resultado, porque el
 * valor que devuelve una acción de formulario se descarta. Con esto la
 * baja se confirma antes y el error se ve donde ocurrió, en vez de
 * llegar a la frontera de error y borrar la pantalla.
 */
export function RemoveMemberButton({
  memberId,
  propertyId,
  personName,
  propertyCode,
}: {
  memberId: string;
  propertyId: string;
  personName: string;
  propertyCode: string;
}) {
  const [pendiente, iniciar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      className="ml-auto text-xs text-muted transition hover:text-danger disabled:opacity-50"
      onClick={() => {
        if (
          !window.confirm(
            `¿Dar de baja a ${personName} de la unidad ${propertyCode}? El historial se conserva.`
          )
        )
          return;
        enTransicion(iniciar, async () => {
          const r = await ejecutar(() => removeMemberAction(memberId, propertyId));
          if (!r) return; // el aviso ya lo dio `ejecutar`
          if (r.ok) toast.success('Residente dado de baja de la unidad.');
          else toast.error(r.error ?? 'No se pudo dar de baja al residente.');
        });
      }}
    >
      {pendiente ? 'Dando de baja…' : 'Dar de baja'}
    </button>
  );
}
