// Comunicados aceptan además documentos de oficina y video.
export const MEDIA_EXT = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp4', 'mov', 'webm',
]);
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024; // 100 MB (videos)

export const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
export const VIDEO_EXT = new Set(['mp4', 'mov', 'webm']);

/** documento | imagen | video — según la extensión del archivo. */
export function fileKind(fileName: string): 'documento' | 'imagen' | 'video' {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'imagen';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'documento';
}

/*
 * Aquí vivía `saveUpload`, que escribía en `public/uploads/` y devolvía
 * una URL pública. Se eliminó a propósito: todo lo que pasaba por ahí
 * —comprobantes de pago, facturas de caja chica, fotos de visitantes,
 * documentos de residentes— quedaba visible para cualquiera que
 * conociera la URL, sin sesión y sin verificar permisos.
 *
 * El reemplazo es `saveToRepository` en src/lib/services/file-refs.ts,
 * que guarda en el repositorio privado y devuelve `/api/archivo/<id>`.
 *
 * No se deja como envoltorio depreciado: mientras la función exista,
 * cualquier módulo nuevo puede volver a exponer archivos sin darse
 * cuenta. Que la compilación falle es la garantía.
 */

/** Extrae el File de un FormData solo si el usuario realmente adjuntó algo. */
export function pickFile(formData: FormData, field: string): File | null {
  const value = formData.get(field);
  if (value instanceof File && value.size > 0 && value.name) return value;
  return null;
}
