-- ============================================================
-- ANEXYpro — Endurecimiento de Row-Level Security
--
-- El archivo 02 habilitó RLS en 77 tablas y creó sus políticas. En la
-- revisión del 31 de julio de 2026 se comprobó que **no se aplicaban
-- nunca**: el usuario de la aplicación era superusuario y además dueño
-- de las tablas, y Postgres no aplica RLS a ninguno de los dos salvo
-- que se declare FORCE. Desde el contexto de una empresa se podían
-- leer, modificar y borrar datos de otra.
--
-- Este archivo hace tres cosas:
--   1. Da política a las tablas de datos de cliente que se crearon
--      después del 02 y quedaron sin ninguna.
--   2. Declara FORCE en todas, para que el dueño tampoco se la salte.
--   3. Deja fuera, a propósito, las tablas de plataforma.
--
-- Es idempotente: se puede correr las veces que haga falta.
--
-- Falta un paso que NO se puede hacer desde aquí: la aplicación debe
-- conectarse con un rol que no sea superusuario ni tenga BYPASSRLS.
-- Ver `scripts/crear-rol-app.sql` y la variable DATABASE_URL.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tablas de cliente que estaban sin política
-- ------------------------------------------------------------

-- Gestión de Tareas.
ALTER TABLE admin_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_task_checklist    ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_task_attachments  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_admin_tasks      ON admin_tasks;
DROP POLICY IF EXISTS tenant_admin_checklist  ON admin_task_checklist;
DROP POLICY IF EXISTS tenant_admin_attach     ON admin_task_attachments;
CREATE POLICY tenant_admin_tasks ON admin_tasks
  USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_admin_checklist ON admin_task_checklist
  USING (task_id IN (SELECT id FROM admin_tasks WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_admin_attach ON admin_task_attachments
  USING (task_id IN (SELECT id FROM admin_tasks WHERE company_id = current_setting('app.current_company_id')));

-- Supervisores asignados a un condominio.
ALTER TABLE condominium_supervisors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_condo_supervisors ON condominium_supervisors;
CREATE POLICY tenant_condo_supervisors ON condominium_supervisors
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

-- Emisión de documentos a solicitud del condómino. Llevan el estado
-- financiero congelado de una filial: son datos sensibles del cliente.
ALTER TABLE document_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_doc_requests  ON document_requests;
DROP POLICY IF EXISTS tenant_doc_templates ON document_templates;
CREATE POLICY tenant_doc_requests ON document_requests
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_doc_templates ON document_templates
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

-- Repositorio de documentos. `storage_folders` tenía RLS habilitado
-- pero su política nunca llegó a crearse —el archivo 02 se aplicaba a
-- mano y quedó a medias—. Una tabla con RLS y sin política NIEGA TODO,
-- así que al declarar FORCE el repositorio habría dejado de funcionar
-- por completo. Se crean las dos de nuevo, sin depender de si existían.
ALTER TABLE storage_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_folders ON storage_folders;
DROP POLICY IF EXISTS tenant_objects ON storage_objects;
-- Las carpetas de plataforma (raíz "ANEXYpro" y "Condominios") no
-- tienen company_id: son comunes a todos los inquilinos.
CREATE POLICY tenant_folders ON storage_folders
  USING (company_id IS NULL OR company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_objects ON storage_objects
  USING (company_id = current_setting('app.current_company_id'));

-- ------------------------------------------------------------
-- 1b. Ninguna tabla puede quedar con RLS y sin política
--
-- Esa combinación no protege: niega todo, y solo se nota cuando ya es
-- tarde. Se comprueba ANTES de forzar.
-- ------------------------------------------------------------
DO $$
DECLARE huerfanas text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO huerfanas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname);
  IF huerfanas IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas con RLS y sin política (niegan todo): %', huerfanas;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. FORCE en todas las tablas que tengan política
--
-- ENABLE no alcanza: el dueño de la tabla se salta RLS mientras no se
-- declare FORCE, y el dueño es justamente quien corre las migraciones.
-- Se recorre pg_policies para no repetir aquí la lista de tablas y que
-- no se desincronice con el archivo 02.
-- ------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Lo que queda fuera de RLS, y por qué
--
--   companies, users .... el inicio de sesión busca por correo antes de
--                         saber a qué empresa pertenece nadie, y el
--                         panel master necesita verlas. El aislamiento
--                         de estas dos lo hace la aplicación.
--   fx_rates ............ catálogo global de tipos de cambio.
--   service_providers ... directorio de proveedores de la plataforma,
--                         común a todos los condominios (no tiene
--                         company_id).
--   job_runs ............ bitácora del programador de tareas, que corre
--                         sin sesión y recorre todas las empresas.
--   storage_settings .... configuración del proveedor de archivos, que
--                         es de plataforma y solo toca el master.
-- ------------------------------------------------------------

-- Comprobación: no debe quedar ninguna tabla con política sin FORCE.
DO $$
DECLARE faltan int;
BEGIN
  SELECT count(*) INTO faltan
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relrowsecurity AND NOT c.relforcerowsecurity;
  IF faltan > 0 THEN
    RAISE EXCEPTION 'Quedaron % tablas con RLS sin FORCE', faltan;
  END IF;
END $$;
