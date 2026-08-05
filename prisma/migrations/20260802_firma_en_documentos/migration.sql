-- Imagen de firma en las plantillas de documentos emitidos
-- (certificación de cuotas al día y estado de cuenta).
ALTER TABLE "document_templates" ADD COLUMN IF NOT EXISTS "signature_url" TEXT;
