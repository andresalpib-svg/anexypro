-- Etapa 6 — Activos y depreciaciones.
--
-- A mano (no el diff automático tal cual) por dos razones:
--   1. `approx_cost` tiene datos reales (5 activos, 4 con costo
--      cargado) — el diff proponía un DROP COLUMN directo, que los
--      hubiera borrado. Aquí se copian a `acquisition_value` PRIMERO
--      y se elimina la columna vieja después.
--   2. `code` (NOT NULL) y `updated_at` (NOT NULL) no pueden agregarse
--      así nomás a una tabla con filas — se agregan nullable/con
--      default, se rellenan, y RECIÉN AHÍ se endurecen.
--
-- Se excluyen a mano (mismo motivo que las migraciones anteriores) los
-- 3 `ALTER COLUMN ... SET DATA TYPE TEXT` que el diff automático
-- propone sobre email en person_invitations/persons/users: son citext
-- (case-insensitive) por una migración raw SQL deliberada, no drift real.

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('lineal');

-- AlterEnum
ALTER TYPE "AssetStatus" ADD VALUE 'baja';

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'depreciacion';

-- AlterTable: agregar todo nullable/con default primero.
ALTER TABLE "assets"
  ADD COLUMN     "acquisition_value" DECIMAL(14,2),
  ADD COLUMN     "code" TEXT,
  ADD COLUMN     "depreciation_method" "DepreciationMethod",
  ADD COLUMN     "depreciation_start_date" DATE,
  ADD COLUMN     "residual_value" DECIMAL(14,2) DEFAULT 0,
  ADD COLUMN     "supplier_id" TEXT,
  ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN     "useful_life_months" INTEGER;

-- Copia approx_cost -> acquisition_value (conserva los datos reales).
UPDATE "assets" SET "acquisition_value" = "approx_cost" WHERE "approx_cost" IS NOT NULL;

-- Código provisional para los activos que ya existían — secuencial por
-- condominio ("ACT-0001", "ACT-0002"...), renombrable después desde la
-- pantalla. Los activos nuevos siempre lo piden en el alta.
UPDATE "assets" a
SET "code" = 'ACT-' || LPAD(sub.rn::text, 4, '0')
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "condominium_id" ORDER BY "created_at") AS rn
  FROM "assets"
) sub
WHERE a."id" = sub."id" AND a."code" IS NULL;

-- Ahora sí, endurecer y limpiar.
ALTER TABLE "assets" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "assets" DROP COLUMN "approx_cost";

-- CreateTable
CREATE TABLE "asset_depreciation_entries" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accumulated_after" DECIMAL(14,2) NOT NULL,
    "book_value_after" DECIMAL(14,2) NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciation_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "book_value_at_disposal" DECIMAL(14,2) NOT NULL,
    "document_url" TEXT,
    "document_name" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_depreciation_entries_condominium_id_idx" ON "asset_depreciation_entries"("condominium_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_depreciation_entries_asset_id_period_key" ON "asset_depreciation_entries"("asset_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposals_asset_id_key" ON "asset_disposals"("asset_id");

-- CreateIndex
CREATE INDEX "asset_disposals_condominium_id_idx" ON "asset_disposals"("condominium_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_condominium_id_code_key" ON "assets"("condominium_id", "code");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation_entries" ADD CONSTRAINT "asset_depreciation_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposals" ADD CONSTRAINT "asset_disposals_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
