import { auth } from '@/lib/auth';
import { moduleOptionsFor } from '@/lib/module-options';
import { ModuleMenu } from '@/components/ui/module-menu';

/**
 * Los tres puntos junto al nombre del módulo.
 *
 * Resuelve qué opciones ve esta sesión y las entrega al menú. Si el
 * módulo no tiene nada configurable —o todo lo que tiene es del
 * titular y quien mira no lo es— no dibuja nada: un menú vacío se
 * siente roto.
 *
 * Uso:
 *   <PageHeader title="…" menu={<ModuleActions module="/app/reservas" condominiumId={condoId} />} />
 */
export async function ModuleActions({
  module,
  condominiumId,
}: {
  module: string;
  /** Condominio Activo, para las opciones que lo necesitan en la URL. */
  condominiumId?: string;
}) {
  const options = moduleOptionsFor(module, await auth(), condominiumId);
  if (options.length === 0) return null;
  return <ModuleMenu options={options} />;
}
