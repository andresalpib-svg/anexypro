import type { Session } from 'next-auth';

/**
 * Qué se puede EDITAR en cada módulo.
 *
 * Es el registro que alimenta el menú de tres puntos que aparece junto
 * al nombre de cada pantalla. Un solo archivo con todas las opciones,
 * por el mismo motivo que `nav-config.ts` concentra la navegación: si
 * cada pantalla decidiera por su cuenta qué ofrecer, terminarían
 * discrepando entre ellas y con los permisos.
 *
 * Aquí van las opciones de CONFIGURACIÓN —cambiar cómo se comporta el
 * módulo, su catálogo, sus formatos—, no el trabajo diario. Registrar
 * una visita o crear un evento se hace desde la pantalla, a la vista:
 * esconder detrás de un menú lo que se usa veinte veces al día sería
 * cambiar dos clics por uno peor.
 *
 * Un módulo sin nada que editar no aparece aquí, y entonces no muestra
 * el menú. Un menú que se abre vacío se siente roto.
 */

export type ModuleOption = {
  label: string;
  description?: string;
  /**
   * Navega a otra pantalla. Puede llevar `{condoId}`, que se sustituye
   * por el Condominio Activo — hay pantallas, como el informe de caja
   * chica, que no funcionan sin él.
   */
  href?: string;
  /**
   * Lleva a una sección de la misma pantalla. El valor es el `id` del
   * elemento; el menú desplaza hasta él y lo resalta un instante.
   */
  anchor?: string;
  /** Solo el administrador principal. */
  ownerOnly?: boolean;
};

/** Clave = href del módulo en `nav-config.ts`. */
export const MODULE_OPTIONS: Record<string, ModuleOption[]> = {
  '/app/incumplimientos': [
    {
      label: 'Configuración del módulo',
      description: 'Catálogo de incumplimientos, plazos de reincidencia, montos de multa y formato de los tres documentos',
      href: '/app/incumplimientos/configuracion',
      ownerOnly: true,
    },
  ],

  '/app/emision-documentos': [
    {
      label: 'Formato de los documentos',
      description: 'Membrete, colores, cuerpo, firma e imagen de firma de la certificación y del estado de cuenta',
      anchor: 'plantillas-documentos',
    },
  ],

  '/app/reservas': [
    {
      label: 'Áreas comunes',
      description: 'Crear y editar las áreas, sus horarios, costo, normativa y reglas de reserva',
      anchor: 'areas-comunes',
    },
  ],

  '/app/propiedades': [
    {
      label: 'Importar base en Excel',
      description: 'Cargar unidades y residentes desde la plantilla oficial',
      anchor: 'importar-excel',
    },
    {
      label: 'Descargar la plantilla de Excel',
      description: 'Formato con las columnas que espera la importación',
      href: '/app/propiedades/plantilla',
    },
    {
      label: 'Usuarios del ecosistema condómino',
      description: 'Crear en conjunto las cuentas de acceso de los residentes',
      anchor: 'usuarios-condominos',
      ownerOnly: true,
    },
  ],

  '/app/condominios': [
    {
      label: 'Nuevo condominio',
      description: 'Dar de alta un condominio y sus unidades',
      href: '/app/condominios/nuevo',
      ownerOnly: true,
    },
  ],

  '/app/mantenimiento': [
    {
      label: 'Activos del condominio',
      description: 'Alta y edición de los activos con su descripción, costo y fotografía',
      anchor: 'activos',
    },
    {
      label: 'Proveedores',
      description: 'Alta y edición de los proveedores de mantenimiento',
      anchor: 'proveedores',
    },
    {
      label: 'Caja chica',
      description: 'Asignación de fondo y registro de gastos',
      anchor: 'caja-chica',
    },
    {
      label: 'Informe de caja chica',
      description: 'PDF con el detalle y las facturas adjuntas',
      href: '/app/mantenimiento/informe-caja-chica?condoId={condoId}',
    },
  ],

  '/app/repositorio': [
    {
      label: 'Reconstruir el árbol de carpetas',
      description: 'Rehace las carpetas que falten en el condominio. No borra nada de lo ya guardado',
      anchor: 'reconstruir-arbol',
      ownerOnly: true,
    },
  ],
};

/**
 * Opciones visibles para esta sesión.
 *
 * Devuelve lista vacía cuando el módulo no tiene nada configurable o
 * cuando todo lo que tiene es del titular y quien mira no lo es — en
 * ambos casos el menú no se dibuja.
 */
export function moduleOptionsFor(
  moduleHref: string,
  session: Session | null,
  condominiumId?: string
): ModuleOption[] {
  const todas = MODULE_OPTIONS[moduleHref] ?? [];
  const esOwner = session?.user?.role === 'admin_owner';
  return todas
    .filter((o) => !o.ownerOnly || esOwner)
    // Una opción que necesita condominio y no lo tiene llevaría a un
    // error: mejor no ofrecerla.
    .filter((o) => !o.href?.includes('{condoId}') || Boolean(condominiumId))
    .map((o) =>
      o.href?.includes('{condoId}')
        ? { ...o, href: o.href.replace('{condoId}', condominiumId ?? '') }
        : o
    );
}
