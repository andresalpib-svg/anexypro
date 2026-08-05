/**
 * Resolución del destino de una subida cuando el formulario no manda el
 * condominio.
 *
 * Al editar una entidad solo llega su identificador, así que el
 * condominio se toma de la entidad misma. Es preferible a confiar en un
 * campo oculto del formulario, que el navegador puede alterar.
 *
 * Las funciones viven en `entity-scope.ts` porque el mismo dato —a qué
 * condominio pertenece esto— resuelve dos preguntas: en qué carpeta se
 * guarda el archivo y si quien lo sube tiene derecho a ese condominio.
 * Se reexportan desde aquí para no cambiar las importaciones que ya
 * existían.
 */
export {
  condoOfAsset,
  condoOfAmenity,
  condoOfTask,
  condoOfVisit,
  taskDestination,
} from '@/lib/services/entity-scope';
