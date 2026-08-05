-- ============================================================
-- ANEXYpro — Rol de conexión de la aplicación
--
-- Row-Level Security no se aplica a un superusuario ni al dueño de la
-- tabla. `FORCE ROW LEVEL SECURITY` (ver 03_rls_endurecido.sql) resuelve
-- lo segundo; lo primero exige que la aplicación NO se conecte como
-- superusuario.
--
-- La separación queda así:
--
--   anexypro      dueño de las tablas. Corre las migraciones.
--                 -> DIRECT_URL
--   anexypro_app  solo lee y escribe filas. Sin SUPERUSER, sin
--                 BYPASSRLS, sin ser dueño de nada.
--                 -> DATABASE_URL  (la que usa la aplicación)
--
-- Cambiar <CLAVE> antes de correrlo. Se ejecuta como el dueño.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anexypro_app') THEN
    CREATE ROLE anexypro_app LOGIN PASSWORD '<CLAVE>';
  END IF;
END $$;

-- Nunca, bajo ninguna circunstancia: son las dos formas de saltarse RLS.
ALTER ROLE anexypro_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE anexypro TO anexypro_app;
GRANT USAGE ON SCHEMA public TO anexypro_app;

-- Datos: puede operar sobre las filas, no sobre la estructura.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anexypro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anexypro_app;

-- Y sobre lo que creen las migraciones futuras, sin tener que volver
-- aquí cada vez que se agregue una tabla.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anexypro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anexypro_app;

-- Comprobación.
DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = 'anexypro_app';
  IF r.rolsuper OR r.rolbypassrls THEN
    RAISE EXCEPTION 'anexypro_app puede saltarse RLS — revisar';
  END IF;
END $$;
