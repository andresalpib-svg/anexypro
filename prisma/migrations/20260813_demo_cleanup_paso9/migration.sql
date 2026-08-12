-- PASO 9: eliminación física de los archivos de Drive de una demo.
--
-- Aditivo: una sola columna nueva, espejo de `demo_converted_at`. Los
-- dos estados terminales que la usan (`DEMO_ELIMINADO`,
-- `DEMO_CLEANUP_FAILED`) ya existen en el enum `DemoStatus` desde
-- 20260812_demo_lifecycle — acá solo se agrega DÓNDE anotar CUÁNDO
-- terminó bien un borrado, sin tener que reconstruirlo desde el texto
-- libre de `demo_history_entries`.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_deleted_at" TIMESTAMP(3);
