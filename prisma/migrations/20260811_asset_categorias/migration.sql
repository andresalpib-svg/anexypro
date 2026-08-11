-- Categorías de activos configurables por condominio.
--
-- Reemplaza el enum fijo `AssetCategory` (elevador, bomba, generador,
-- piscina, portón, techo, otro) por una tabla propia de cada
-- condominio, con el mismo patrón que `violation_types`: siembra con
-- las siete de partida y desde ahí la administración agrega, renombra
-- o desactiva las suyas sin tocar código.

-- 1) Tabla de categorías
CREATE TABLE "asset_category_options" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_category_options_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_category_options_condominium_id_idx" ON "asset_category_options"("condominium_id");
ALTER TABLE "asset_category_options" ADD CONSTRAINT "asset_category_options_condominium_id_fkey"
  FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Siembra las siete categorías de partida en cada condominio que
--    todavía no tenga catálogo (no pisa lo que ya se hubiera creado).
INSERT INTO "asset_category_options" (id, condominium_id, name, sort_order)
SELECT gen_random_uuid()::text, c.id, v.name, v.sort_order
FROM condominiums c
CROSS JOIN (VALUES
  ('Elevador', 1), ('Bomba', 2), ('Generador', 3), ('Piscina', 4),
  ('Portón', 5), ('Techo', 6), ('Otro', 7)
) AS v(name, sort_order)
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM asset_category_options existing WHERE existing.condominium_id = c.id);

-- 3) Nueva columna en assets, referida a la categoría
ALTER TABLE "assets" ADD COLUMN "category_id" TEXT;

-- 4) Backfill: cada activo apunta a la categoría de su condominio con
--    el nombre equivalente al valor que tenía en el enum viejo.
UPDATE "assets" a
SET "category_id" = aco.id
FROM "asset_category_options" aco
WHERE aco.condominium_id = a.condominium_id
  AND aco.name = CASE a."category"
    WHEN 'elevador' THEN 'Elevador'
    WHEN 'bomba' THEN 'Bomba'
    WHEN 'generador' THEN 'Generador'
    WHEN 'piscina' THEN 'Piscina'
    WHEN 'porton' THEN 'Portón'
    WHEN 'techo' THEN 'Techo'
    ELSE 'Otro'
  END;

-- Cualquier activo sin coincidencia (no debería pasar) cae en "Otro"
-- de su propio condominio, para no dejar categoría en blanco.
UPDATE "assets" a
SET "category_id" = (
  SELECT id FROM "asset_category_options" aco
  WHERE aco.condominium_id = a.condominium_id AND aco.name = 'Otro'
  LIMIT 1
)
WHERE a."category_id" IS NULL;

-- 5) Fuera el enum viejo
ALTER TABLE "assets" DROP COLUMN "category";
DROP TYPE "AssetCategory";

-- 6) FK de categoría. SET NULL y no RESTRICT porque una categoría con
--    activos no se deja borrar desde la aplicación (se desactiva), pero
--    la base no depende de esa disciplina para no romperse.
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "asset_category_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
