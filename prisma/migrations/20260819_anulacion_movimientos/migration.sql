-- ETAPA 8 — Anulación en vez de eliminación física.
--
-- Los movimientos de fondo y los de caja chica se borraban de verdad:
-- el saldo cambiaba y no quedaba rastro de que el movimiento hubiera
-- existido, ni de quién lo quitó ni por qué. A partir de acá se anulan
-- (dejan de sumar, siguen estando) — mismo criterio que ya usaban los
-- gastos (`expenses.voided_at`) y los cargos (`charges.status`).

ALTER TABLE fund_movements
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by   TEXT;

ALTER TABLE petty_cash_expenses
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by   TEXT;

ALTER TABLE petty_cash_allocations
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by   TEXT;

-- Los saldos filtran por `voided_at IS NULL`; el índice parcial evita
-- recorrer los anulados en cada cálculo de saldo.
CREATE INDEX IF NOT EXISTS fund_movements_vigentes_idx
  ON fund_movements (fund_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS petty_cash_expenses_vigentes_idx
  ON petty_cash_expenses (company_id, condominium_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS petty_cash_allocations_vigentes_idx
  ON petty_cash_allocations (company_id, condominium_id) WHERE voided_at IS NULL;
