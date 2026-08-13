-- Da acceso de LECTURA al residente sobre "multimedia/fotografias".
--
-- POR QUÉ. Esa carpeta guarda tanto las fotos de activos de
-- mantenimiento como las fotos de las áreas comunes (amenidades) que
-- se muestran en el portal de reservas. El permiso de repositorio
-- (`storage/permissions.ts`) niega por defecto cualquier carpeta que no
-- incluya explícitamente el rol `condomino` en `allowed_roles`, así que
-- el residente nunca veía la fotografía de un área común al ir a
-- reservar — la petición a `/api/archivo/<id>` volvía 403.
--
-- `src/lib/storage/tree.ts` ya se corrigió para que las carpetas
-- NUEVAS se creen con `condomino` incluido; esto backfillea las que ya
-- existían en producción, donde `allowed_roles` quedó congelado en el
-- valor con el que se creó la fila (`ensureCondoTree` no las
-- resincroniza sola). Solo agrega el rol si falta —seguro de
-- re-ejecutar—; no toca el resto de `allowed_roles` ni ninguna otra
-- carpeta.
--
-- Consecuencia aceptada: el residente también puede ver las fotos de
-- activos de mantenimiento que comparten esta misma carpeta (equipos,
-- bombas, etc.) — no son datos sensibles. Sigue sin poder ESCRIBIR acá
-- (`canWriteFolder` no la incluye en el buzón de reservas/visitas), ni
-- listar/leer ninguna otra carpeta administrativa.

UPDATE storage_folders
SET allowed_roles = array_append(allowed_roles, 'condomino')
WHERE slug = 'multimedia/fotografias'
  AND NOT ('condomino' = ANY(allowed_roles));
