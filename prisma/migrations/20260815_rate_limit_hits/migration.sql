-- Tabla de freno de tasa por IP (auditoría de seguridad 2026-08-11,
-- hallazgo: sin rate limiting en login/recuperar/demo).
--
-- POR QUÉ ESTA TABLA Y NO REDIS: no hay Upstash/Redis en este
-- despliegue. Postgres ya es la única pieza de infraestructura
-- compartida entre las instancias serverless, así que un freno
-- respaldado en Postgres es correcto entre instancias sin sumar un
-- servicio nuevo.
--
-- SIN Row-Level Security a propósito, igual que `users`/`companies`:
-- se consulta antes de saber a qué empresa pertenece nadie (login,
-- /recuperar, /demo), y no guarda ningún dato de un tenant.
--
-- Idempotente: `IF NOT EXISTS` en la tabla y el índice, como el resto
-- de las migraciones aditivas de este proyecto.

CREATE TABLE IF NOT EXISTS "rate_limit_hits" (
    "id" BIGSERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rate_limit_hits_bucket_created_at_idx" ON "rate_limit_hits"("bucket", "created_at");
