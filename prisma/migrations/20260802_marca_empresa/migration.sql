-- Identidad visual por empresa administradora: el panel de sus usuarios
-- se pinta con su color, no con el azul de ANEXYpro.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "brand_primary" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "brand_deep" TEXT;
