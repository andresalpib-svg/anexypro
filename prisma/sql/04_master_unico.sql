-- ============================================================
-- ANEXYpro — Un solo usuario master
--
-- El master es el dueño de la plataforma: ve todas las empresas
-- administradoras y no pertenece a ninguna. Por decisión de producto
-- (31 de julio de 2026) solo puede existir UNO.
--
-- La regla vive en la base y no solo en el código: al master no se le
-- crea desde ninguna pantalla —`inviteStaffUser` solo produce
-- supervisores—, así que el camino real para que aparezca un segundo
-- sería un sembrado, un guion suelto o SQL a mano. Un índice único
-- parcial los cubre todos.
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE cuantos int;
BEGIN
  SELECT count(*) INTO cuantos FROM users WHERE role = 'master';
  IF cuantos > 1 THEN
    RAISE EXCEPTION 'Ya existen % usuarios master. Dejá uno solo antes de aplicar esta regla.', cuantos;
  END IF;
END $$;

DROP INDEX IF EXISTS users_un_solo_master;
CREATE UNIQUE INDEX users_un_solo_master ON users ((role)) WHERE role = 'master';

COMMENT ON INDEX users_un_solo_master IS
  'Un solo usuario master en toda la plataforma (decisión de producto, 2026-07-31).';
