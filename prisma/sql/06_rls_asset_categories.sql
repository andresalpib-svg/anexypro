-- ============================================================
-- ANEXYpro — Row-Level Security de las categorías de activos
--
-- `asset_category_options` (migración 20260811_asset_categorias)
-- reemplaza el enum fijo `AssetCategory`: entra al mismo aislamiento
-- por empresa que el resto de tablas de cliente, con FORCE.
--
-- Idempotente.
-- ============================================================

ALTER TABLE asset_category_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_asset_category_options ON asset_category_options;

CREATE POLICY tenant_asset_category_options ON asset_category_options
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

ALTER TABLE asset_category_options FORCE ROW LEVEL SECURITY;

-- El rol de la aplicación necesita permiso sobre la tabla nueva.
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_category_options TO anexypro_app;

-- Comprobación: no puede quedar sin política o sin FORCE.
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO malas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('asset_category_options')
    AND (NOT c.relforcerowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname));
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Tabla de categorías de activos sin política o sin FORCE: %', malas;
  END IF;
END $$;
