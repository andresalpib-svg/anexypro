import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { companyHasCondominiums } from '@/lib/services/condominiums';

/**
 * Pantalla vacía cuando el módulo no tiene condominio sobre el cual
 * trabajar.
 *
 * POR QUÉ EXISTE: los 18 módulos decían lo mismo —"Primero crea un
 * condominio en Gestión de Condominios"— sin importar quién estuviera
 * mirando. A un supervisor sin asignaciones eso lo mandaba a un módulo
 * que no puede abrir, a hacer algo que su rol tiene prohibido, y lo
 * dejaba creyendo que el sistema estaba vacío cuando en realidad la
 * empresa tiene tres condominios (prueba por rol del 2026-08-08).
 *
 * Son dos situaciones distintas y cada una tiene una salida distinta:
 * que no exista ningún condominio, o que existan y a este usuario no le
 * hayan asignado ninguno.
 */
export async function SinCondominio({
  companyId,
  role,
}: {
  companyId: string;
  role: string;
}) {
  const puedeCrear = role === 'admin_owner';
  const hayEnLaEmpresa = await companyHasCondominiums(companyId);

  const { titulo, detalle } = !hayEnLaEmpresa
    ? puedeCrear
      ? {
          titulo: 'Todavía no hay condominios',
          detalle: 'Creá el primero para empezar a trabajar — todo lo demás cuelga de él.',
        }
      : {
          titulo: 'Todavía no hay condominios',
          detalle: 'La administración aún no ha registrado ninguno.',
        }
    : {
        titulo: 'No tenés condominios asignados',
        detalle:
          'La empresa sí tiene condominios, pero a tu usuario no le han asignado ninguno. Pedile a la administración que te asigne al menos uno.',
      };

  return (
    <div className="card p-10 text-center">
      <Building2 className="mx-auto mb-3 text-muted" size={26} />
      <p className="text-sm font-semibold text-ink">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{detalle}</p>
      {!hayEnLaEmpresa && puedeCrear && (
        <Link href="/app/condominios/nuevo" className="btn-primary mt-4 inline-flex py-2 text-xs">
          Crear el primer condominio
        </Link>
      )}
    </div>
  );
}
