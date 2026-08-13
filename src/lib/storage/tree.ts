/**
 * Estructura de carpetas de cada condominio.
 *
 * INTERPRETACIÓN DE LA LISTA: la lista que definió Freddy venía con
 * algunos nombres claramente subordinados a otros (Actas y Asambleas
 * bajo Administración; Proveedores y Mantenimiento bajo Contratos;
 * Cobros y Reportes bajo Facturas; Reservas y Visitas bajo Seguridad;
 * Fotografías y Logos bajo Multimedia). Se implementó con esa jerarquía
 * porque es la que hace navegable el repositorio. Si alguna de esas
 * carpetas debe ir al primer nivel, se cambia acá y el árbol se
 * reconstruye sin perder archivos: las carpetas se identifican por su
 * `slug`, no por su posición.
 */

export type FolderSpec = {
  /** Nombre visible, tal como se crea en el proveedor. */
  name: string;
  /** Ruta lógica estable. Es la que usa el código, nunca el nombre. */
  slug: string;
  children?: FolderSpec[];
  /**
   * Roles con acceso. Si se omite, hereda del padre.
   * `condomino` casi nunca aparece acá: el residente entra a su propia
   * carpeta (que se crea aparte), no a las de `CONDO_TREE`. La única
   * excepción es "multimedia/fotografias", que el residente necesita
   * LEER para ver las fotos de las áreas comunes al reservar —sigue
   * sin poder escribir, eso lo decide `canWriteFolder`, no esta lista.
   */
  roles?: string[];
};

/** Todo el personal de la administradora más el contador. */
const ADMIN = ['master', 'admin_owner', 'admin_staff', 'contador'];
/** Lo que además ve la junta directiva. */
const ADMIN_JUNTA = [...ADMIN, 'junta_directiva'];
/** Lo que además ve el personal de seguridad. */
const ADMIN_SEGURIDAD = [...ADMIN, 'seguridad'];

export const CONDO_TREE: FolderSpec[] = [
  {
    name: 'Administración',
    slug: 'administracion',
    roles: ADMIN,
    children: [
      { name: 'Actas', slug: 'administracion/actas', roles: ADMIN_JUNTA },
      { name: 'Asambleas', slug: 'administracion/asambleas', roles: ADMIN_JUNTA },
      { name: 'Estados de Cuenta', slug: 'administracion/estados-de-cuenta', roles: ADMIN },
      { name: 'Comunicados', slug: 'administracion/comunicados', roles: ADMIN },
      { name: 'Reglamentos', slug: 'administracion/reglamentos', roles: ADMIN_JUNTA },
    ],
  },
  {
    name: 'Contratos',
    slug: 'contratos',
    roles: ADMIN_JUNTA,
    children: [
      { name: 'Proveedores', slug: 'contratos/proveedores', roles: ADMIN_JUNTA },
      { name: 'Mantenimiento', slug: 'contratos/mantenimiento', roles: ADMIN_JUNTA },
    ],
  },
  {
    name: 'Facturas',
    slug: 'facturas',
    roles: ADMIN,
    children: [
      { name: 'Cobros', slug: 'facturas/cobros', roles: ADMIN },
      { name: 'Reportes', slug: 'facturas/reportes', roles: ADMIN_JUNTA },
    ],
  },
  // El área de incumplimientos no se expone a la junta ni al contador
  // (misma decisión que el módulo: los expedientes son sensibles).
  { name: 'Incumplimientos', slug: 'incumplimientos', roles: ['master', 'admin_owner', 'admin_staff'] },
  { name: 'Junta Directiva', slug: 'junta-directiva', roles: ADMIN_JUNTA },
  // Contenedor de las carpetas individuales. Nadie guarda archivos
  // sueltos acá: cada residente tiene la suya adentro.
  { name: 'Residentes', slug: 'residentes', roles: ADMIN },
  {
    name: 'Seguridad',
    slug: 'seguridad',
    roles: ADMIN_SEGURIDAD,
    children: [
      { name: 'Reservas', slug: 'seguridad/reservas', roles: ADMIN_SEGURIDAD },
      { name: 'Visitas', slug: 'seguridad/visitas', roles: ADMIN_SEGURIDAD },
    ],
  },
  {
    name: 'Multimedia',
    slug: 'multimedia',
    roles: ADMIN,
    children: [
      // Comparte activos de mantenimiento y fotos de áreas comunes: el
      // residente necesita ver estas últimas al reservar, por eso es
      // la única carpeta de `CONDO_TREE` que sí lo incluye (ver el
      // comentario de `FolderSpec.roles` más arriba). Sigue sin poder
      // escribir acá: `canWriteFolder` no la trata como buzón.
      { name: 'Fotografías', slug: 'multimedia/fotografias', roles: [...ADMIN, 'condomino'] },
      { name: 'Logos', slug: 'multimedia/logos', roles: ADMIN },
    ],
  },
  { name: 'Documentos Temporales', slug: 'documentos-temporales', roles: ADMIN },
  { name: 'Otros', slug: 'otros', roles: ADMIN },
  // Solo el master: son respaldos de la plataforma, no del condominio.
  { name: 'Respaldos', slug: 'respaldos', roles: ['master'] },
];

/** Nombre de la carpeta raíz y de los contenedores de primer nivel. */
export const ROOT_NAME = 'ANEXYpro';
export const CONDOS_NAME = 'Condominios';
/**
 * Contenedor de las empresas DEMO (PASO 8) — hermano de "Condominios",
 * nunca mezclado con él. Cada demo cuelga de acá con su propia
 * carpeta (`demoFolderName`), y adentro usa EL MISMO `CONDO_TREE` que
 * cualquier condominio real: no se inventó una taxonomía aparte para
 * demos, se reutilizó la existente.
 */
export const DEMOS_NAME = 'DEMOS';
export const RESIDENTS_SLUG = 'residentes';

/**
 * Nombre de la carpeta exclusiva de una demo dentro de "DEMOS".
 *
 * Lleva el `companyId` completo a propósito — es el mismo id que la
 * fila de `StorageFolder` guarda en su columna `company_id`, así que
 * el nombre es trazable a simple vista sin dejar de ser cierto que la
 * identificación real es la columna, no el texto (ver
 * `services/storage.ts` → `ensureCondoTree`).
 */
export function demoFolderName(companyId: string): string {
  return `DEMO_${companyId}`;
}

/** Aplana el árbol en orden de creación (padres antes que hijos). */
export function flattenTree(specs: FolderSpec[] = CONDO_TREE): FolderSpec[] {
  const out: FolderSpec[] = [];
  const walk = (list: FolderSpec[]) => {
    for (const spec of list) {
      out.push(spec);
      if (spec.children) walk(spec.children);
    }
  };
  walk(specs);
  return out;
}

/** Busca una especificación por su ruta lógica. */
export function specBySlug(slug: string): FolderSpec | undefined {
  return flattenTree().find((s) => s.slug === slug);
}

/** El slug de la carpeta de un residente, estable ante cambios de nombre. */
export function residentSlug(personId: string): string {
  return `${RESIDENTS_SLUG}/${personId}`;
}
