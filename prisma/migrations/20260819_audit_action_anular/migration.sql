-- ETAPA 8 — "anular" como acción auditable propia.
-- Un movimiento financiero no se elimina: se anula. Distinguirlo de
-- `eliminar` permite responder "¿qué se anuló este mes?" sin adivinar.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'anular';
