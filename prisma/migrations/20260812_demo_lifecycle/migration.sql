-- Estructura de ciclo de vida para empresas DEMO (PASO 2).
--
-- POR QUÉ: la migración anterior (20260811_demo_companies) solo traía
-- `is_demo` y `demo_expires_at` — suficiente para bloquear el acceso,
-- pero no para CONSULTAR en qué etapa está una demo, quién la creó, o
-- cuándo le tocaría una limpieza futura. Estas columnas y la tabla de
-- historial son puramente aditivas: ninguna fila existente cambia de
-- comportamiento (todas quedan con `demo_status` NULL, que es
-- exactamente "no aplica, no es una empresa demo").

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DemoStatus') THEN
    CREATE TYPE "DemoStatus" AS ENUM (
      'DEMO_ACTIVO',
      'DEMO_VENCIDO',
      'DEMO_CONVERTIDO',
      'DEMO_ELIMINADO',
      'DEMO_CLEANUP_FAILED'
    );
  END IF;
END $$;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_status" "DemoStatus";
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_started_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_delete_scheduled_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_created_by_id" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_converted_at" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_demo_created_by_id_fkey'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_demo_created_by_id_fkey"
      FOREIGN KEY ("demo_created_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "demo_history_entries" (
  "id"            TEXT NOT NULL,
  "company_id"    TEXT NOT NULL,
  "event"         TEXT NOT NULL,
  "detail"        TEXT,
  "occurred_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_user_id" TEXT,

  CONSTRAINT "demo_history_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "demo_history_entries_company_id_occurred_at_idx"
  ON "demo_history_entries"("company_id", "occurred_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demo_history_entries_company_id_fkey'
  ) THEN
    ALTER TABLE "demo_history_entries"
      ADD CONSTRAINT "demo_history_entries_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'demo_history_entries_actor_user_id_fkey'
  ) THEN
    ALTER TABLE "demo_history_entries"
      ADD CONSTRAINT "demo_history_entries_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Sin RLS a propósito: `companies` tampoco la lleva (el login la
-- necesita antes de saber de qué empresa es nadie), y esta tabla es
-- información de PLATAFORMA — la consulta el master, no un condominio.
