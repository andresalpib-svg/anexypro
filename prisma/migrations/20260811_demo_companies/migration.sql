-- Sistema DEMO: empresas efímeras creadas desde /demo.
--
-- POR QUÉ: sin un campo que distinga "empresa demo" de "empresa real",
-- los jobs financieros (facturación, interés moratorio, cobranza,
-- informe mensual) no pueden excluirlas, y el repositorio de archivos
-- no puede saber que un condominio demo debe usar el proveedor
-- `local` en vez del Google Drive real de la plataforma.
--
-- `is_demo` por omisión `false`: ninguna empresa existente cambia de
-- comportamiento. `demo_expires_at` es NULL para todas — el job
-- `demo-vencidos` solo actúa sobre filas con `is_demo = true` Y una
-- fecha de vencimiento vencida.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_demo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "demo_expires_at" TIMESTAMP(3);

-- Los jobs y el panel master filtran por `is_demo` a diario.
CREATE INDEX IF NOT EXISTS "companies_is_demo_idx" ON "companies"("is_demo") WHERE "is_demo" = true;
