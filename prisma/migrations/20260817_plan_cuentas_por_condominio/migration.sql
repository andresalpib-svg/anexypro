-- Plan de cuentas (chart_of_accounts) por CONDOMINIO, no por empresa.
--
-- POR QUÉ. Auditoría del módulo de Finanzas (2026-08-13): una empresa
-- con varios condominios los hacía compartir el mismo plan de cuentas
-- (mismas filas de `chart_of_accounts`), porque el catálogo se sembraba
-- una sola vez al crear la EMPRESA (`ensureChartOfAccounts` en
-- `createCompanyWithAdmin`). La regla del negocio es que cada
-- condominio hereda la ESTRUCTURA del catálogo (la plantilla estándar
-- de cuentas) pero nunca la INFORMACIÓN de otro condominio — y una fila
-- de base de datos compartida entre condominios rompe esa regla aunque
-- el contenido en sí sea genérico: si el día de mañana un condominio
-- necesita una cuenta propia (renombrar, desactivar, agregar una), hoy
-- eso afectaría a todos los demás condominios de la misma empresa.
--
-- QUÉ HACE, en orden:
--   1) Agrega `condominium_id` (nullable de momento).
--   2) Por cada condominio, clona el plan de cuentas de SU empresa —
--      mismos código/nombre/tipo/sub/is_operating/is_system— en filas
--      nuevas, propias de ese condominio.
--   3) Remapea `journal_lines` y `budget_lines` para que cada línea
--      apunte a la cuenta de SU PROPIO condominio (mismo código),
--      nunca a la fila vieja compartida.
--   4) Borra las filas viejas (compartidas por empresa) y deja
--      `condominium_id` obligatorio, con su propia llave única e índice
--      — reemplazando la unicidad anterior por (company_id, code).
--
-- Es seguro de re-ejecutar hasta el paso 2 inclusive (no duplica si ya
-- existe una fila con ese condominio_id y code); los pasos 3 en
-- adelante solo tocan filas que todavía apuntan al esquema viejo
-- (`chart_of_accounts.condominium_id IS NULL`), así que tampoco
-- duplican trabajo si el script se corre dos veces seguidas.

-- 1) Columna nueva, todavía opcional. La vieja unicidad (company_id,
--    code) se quita ya mismo: en cuanto una empresa tenga más de un
--    condominio, el paso 2 va a insertar varias filas con el mismo
--    (company_id, code) —un juego completo por condominio— y esa
--    restricción lo impediría. La reemplaza la de (condominium_id,
--    code) al final del script.
-- Era un índice único (`CREATE UNIQUE INDEX`), no una constraint de
-- tabla — por eso se quita con DROP INDEX, no con DROP CONSTRAINT.
ALTER TABLE "chart_of_accounts" ADD COLUMN IF NOT EXISTS "condominium_id" TEXT;
DROP INDEX IF EXISTS "chart_of_accounts_company_id_code_key";

-- 2) Clona el catálogo de la empresa en cada uno de sus condominios.
--    Un condominio que ya tenga su propio catálogo (condominium_id no
--    nulo) se salta — así no se duplica si esto se corre dos veces.
INSERT INTO "chart_of_accounts" (id, company_id, condominium_id, code, name, type, parent_id, is_system, sub, is_operating)
SELECT gen_random_uuid()::text, ca.company_id, cnd.id, ca.code, ca.name, ca.type, NULL, ca.is_system, ca.sub, ca.is_operating
FROM "chart_of_accounts" ca
JOIN "condominiums" cnd ON cnd.company_id = ca.company_id
WHERE ca.condominium_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "chart_of_accounts" ya
    WHERE ya.condominium_id = cnd.id AND ya.code = ca.code
  );
-- (`parent_id` queda NULL a propósito: en los datos reales ninguna
-- cuenta tenía padre —el plan de cuentas estándar es de un solo
-- nivel—, así que no hace falta remapear jerarquía. Si en el futuro
-- existieran subcuentas, este INSERT tendría que resolver el padre
-- nuevo del mismo condominio antes de este paso.)

-- 3) Remapea los asientos y el presupuesto a la copia de SU condominio.
UPDATE "journal_lines" jl
SET account_id = nueva.id
FROM "journal_entries" je, "chart_of_accounts" vieja, "chart_of_accounts" nueva
WHERE jl.entry_id = je.id
  AND jl.account_id = vieja.id
  AND vieja.condominium_id IS NULL
  AND nueva.condominium_id = je.condominium_id
  AND nueva.code = vieja.code;

UPDATE "budget_lines" bl
SET account_id = nueva.id
FROM "chart_of_accounts" vieja, "chart_of_accounts" nueva
WHERE bl.account_id = vieja.id
  AND vieja.condominium_id IS NULL
  AND nueva.condominium_id = bl.condominium_id
  AND nueva.code = vieja.code;

-- 4) Fuera las filas viejas (compartidas por empresa) — ya nada las
--    referencia tras el paso 3.
DELETE FROM "chart_of_accounts" WHERE "condominium_id" IS NULL;

-- 5) `condominium_id` pasa a obligatorio, con su FK y su propia unicidad.
ALTER TABLE "chart_of_accounts" ALTER COLUMN "condominium_id" SET NOT NULL;
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_condominium_id_fkey"
  FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "chart_of_accounts_condominium_id_code_key" ON "chart_of_accounts"("condominium_id", "code");
CREATE INDEX "chart_of_accounts_condominium_id_idx" ON "chart_of_accounts"("condominium_id");
