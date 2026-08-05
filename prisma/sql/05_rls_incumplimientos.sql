-- ============================================================
-- ANEXYpro — Row-Level Security del módulo de Incumplimientos
--
-- Un expediente disciplinario guarda quién incumplió qué, con
-- fotografías y multas: es de lo más sensible que maneja el sistema.
-- Las cinco tablas entran al mismo aislamiento que el resto, con
-- FORCE, para que ni el dueño de las tablas se lo salte.
--
-- Idempotente.
-- ============================================================

ALTER TABLE violation_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_cases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_actions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE violation_evidences  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_violation_types     ON violation_types;
DROP POLICY IF EXISTS tenant_violation_settings  ON violation_settings;
DROP POLICY IF EXISTS tenant_violation_cases     ON violation_cases;
DROP POLICY IF EXISTS tenant_violation_actions   ON violation_actions;
DROP POLICY IF EXISTS tenant_violation_evidences ON violation_evidences;

CREATE POLICY tenant_violation_types ON violation_types
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

CREATE POLICY tenant_violation_settings ON violation_settings
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

CREATE POLICY tenant_violation_cases ON violation_cases
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

CREATE POLICY tenant_violation_actions ON violation_actions
  USING (case_id IN (SELECT id FROM violation_cases WHERE condominium_id IN
    (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));

CREATE POLICY tenant_violation_evidences ON violation_evidences
  USING (action_id IN (SELECT a.id FROM violation_actions a JOIN violation_cases c ON c.id = a.case_id
    WHERE c.condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));

ALTER TABLE violation_types      FORCE ROW LEVEL SECURITY;
ALTER TABLE violation_settings   FORCE ROW LEVEL SECURITY;
ALTER TABLE violation_cases      FORCE ROW LEVEL SECURITY;
ALTER TABLE violation_actions    FORCE ROW LEVEL SECURITY;
ALTER TABLE violation_evidences  FORCE ROW LEVEL SECURITY;

-- El rol de la aplicación necesita permiso sobre las tablas nuevas.
-- `ALTER DEFAULT PRIVILEGES` cubre lo que se cree de aquí en adelante,
-- pero estas ya existen cuando se corre esto.
GRANT SELECT, INSERT, UPDATE, DELETE ON violation_types, violation_settings,
  violation_cases, violation_actions, violation_evidences TO anexypro_app;

-- Comprobación: ninguna de las cinco puede quedar sin política o sin FORCE.
DO $$
DECLARE malas text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO malas
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('violation_types','violation_settings','violation_cases','violation_actions','violation_evidences')
    AND (NOT c.relforcerowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = c.relname));
  IF malas IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas de incumplimientos sin política o sin FORCE: %', malas;
  END IF;
END $$;
