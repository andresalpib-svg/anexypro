-- Etapa 5 — Fondos e inversiones: el interés de inversión genera un
-- asiento contable propio (ingreso financiero, nunca cuota condominal),
-- así que necesita su propio valor en el origen del asiento.
--
-- Se excluyen a mano (mismo motivo que la migración anterior) los 3
-- `ALTER COLUMN ... SET DATA TYPE TEXT` que el diff automático propone
-- sobre email en person_invitations/persons/users: son citext
-- (case-insensitive) por una migración raw SQL deliberada, no drift real.

-- AlterEnum
ALTER TYPE "JournalSource" ADD VALUE 'inversion';
