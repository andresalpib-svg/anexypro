-- Un gasto de Finanzas puede imputarse a un proyecto.
--
-- POR QUÉ: cuando el gasto de proyecto pasó a Finanzas se retiró el
-- módulo que alimentaba `project_expenses`, y desde entonces la
-- tarjeta del kanban mostraba "₡0 de ₡X" para siempre — un número que
-- ya nadie podía mover. Esta columna vuelve a conectar las dos puntas.
--
-- La columna es OPCIONAL y sin valor por omisión: la mayoría de los
-- gastos son de operación, no de proyecto, y ninguna fila existente
-- cambia. `ON DELETE SET NULL` porque borrar un proyecto no debe
-- borrar la factura: el gasto ocurrió igual y tiene que seguir en la
-- contabilidad; solo pierde la imputación.
--
-- Nota: `prisma migrate diff` también propone revertir las columnas
-- `email` de citext a text. NO hay que incluirlo: `prisma/sql/01` las
-- convierte a citext a propósito y esa divergencia es permanente.

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "project_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_project_id_fkey'
  ) THEN
    ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "expenses_project_id_idx" ON "expenses"("project_id");
