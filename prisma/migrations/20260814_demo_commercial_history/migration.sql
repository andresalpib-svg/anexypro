-- PASO 11: historial comercial permanente de una cuenta DEMO.
--
-- Aditivo: tres columnas nuevas, mismo criterio que
-- 20260812_demo_lifecycle. Ninguna se borra junto con la demo — la fila
-- de `companies` nunca se elimina físicamente (`purgeDemoDriveFiles`,
-- PASO 9, solo borra storage_folders/storage_objects), así que este
-- historial sobrevive intacto a la purga de archivos.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_converted_by_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_converted_plan_name" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_commercial_notes" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_demo_converted_by_id_fkey'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_demo_converted_by_id_fkey"
      FOREIGN KEY ("demo_converted_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
