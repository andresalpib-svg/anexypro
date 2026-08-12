-- PASO 8: carpeta exclusiva de Drive por cuenta demo.
--
-- Aditivo: ninguna fila existente cambia de comportamiento. Estos tres
-- campos son una copia EXPLÍCITA (no la única fuente de verdad, que
-- sigue siendo `storage_folders`) del mapeo "esta demo -> su carpeta
-- real", para que un futuro proceso de limpieza no tenga que
-- reconstruir el árbol de carpetas para saber dónde actuar.
--
-- "demo_id"/"tenant_id" no se duplican en columnas nuevas: `companies.id`
-- ya cumple ese papel (es la misma columna que usa `storage_folders.company_id`).

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_drive_folder_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_drive_folder_name" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_drive_folder_created_at" TIMESTAMP(3);
