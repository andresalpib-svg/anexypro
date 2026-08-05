-- Formato propio para la segunda notificación en adelante: tiene que
-- recordar cuándo se envió la primera y advertir de la consecuencia.
ALTER TABLE "violation_types" ADD COLUMN IF NOT EXISTS "second_warning_template" TEXT;
