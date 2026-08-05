-- Índices de rendimiento — auditoría del 5 de agosto de 2026.
--
-- Se agregan ahora, con las tablas casi vacías, porque crear un índice
-- sobre una tabla llena bloquea escrituras. Ninguno cambia datos.
--
-- Nota: `prisma migrate diff` también propone revertir las columnas
-- `email` de citext a text. NO hay que incluirlo: `prisma/sql/01` las
-- convierte a citext a propósito (Prisma no tiene ese tipo) y esa
-- divergencia es permanente y esperada.

-- Van con IF NOT EXISTS porque la base de producción se creó sin
-- historial de migraciones (con `db push` o SQL a mano). Al establecer
-- la línea base no se puede saber con certeza qué índices ya existen,
-- y una migración que falla deja el despliegue bloqueado.

-- El filtro más usado del producto: cargos pendientes o parciales ya
-- vencidos de un condominio. Lo hacen morosidad, cobranza, intereses
-- moratorios y los reportes.
CREATE INDEX IF NOT EXISTS "charges_condominium_id_status_due_date_idx" ON "charges"("condominium_id", "status", "due_date");

-- Pagos del condominio por fecha; es además la columna por la que
-- filtra su propia política de RLS.
CREATE INDEX IF NOT EXISTS "payments_condominium_id_payment_date_idx" ON "payments"("condominium_id", "payment_date" DESC);

-- `listCondominiumsForSession` busca por userId en casi todas las
-- pantallas del panel; el índice único (condominium_id, user_id) no
-- sirve para eso porque user_id no es su primera columna.
CREATE INDEX IF NOT EXISTS "condominium_supervisors_user_id_idx" ON "condominium_supervisors"("user_id");

-- Asambleas: puntos y adjuntos se leen siempre por asamblea.
CREATE INDEX IF NOT EXISTS "assembly_topics_assembly_id_idx" ON "assembly_topics"("assembly_id");
CREATE INDEX IF NOT EXISTS "assembly_attachments_assembly_id_idx" ON "assembly_attachments"("assembly_id");

-- Destinatarios de un comunicado.
CREATE INDEX IF NOT EXISTS "communication_targets_communication_id_idx" ON "communication_targets"("communication_id");
