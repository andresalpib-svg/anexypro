-- Evaluación de errores 2026-08-11 (segunda pasada), hallazgos #8 y #17:
-- dos condiciones de carrera "chequear-antes-de-crear" sin respaldo de
-- constraint único. El código ya hace el `findFirst` + `create` dentro
-- de una misma transacción Prisma (`withTenantContext`), pero en
-- READ COMMITTED (el nivel por omisión de Postgres, el que usa este
-- proyecto) un `SELECT` no bloquea a un `INSERT` concurrente de OTRA
-- transacción: dos peticiones casi simultáneas pueden pasar el
-- `findFirst` antes de que ninguna haya insertado. El índice único
-- parcial cierra la ventana a nivel de base de datos, sin importar
-- cuántas transacciones concurrentes lo intenten.
--
-- Se verificó antes de aplicar (rol dueño, sin RLS) que no existen hoy
-- duplicados en ninguna de las dos tablas, así que la migración es
-- segura de aplicar contra datos reales.
--
-- Idempotente: `IF NOT EXISTS`, como el resto de las migraciones
-- aditivas de este proyecto.

-- #8: un convenio de pago "vigente" por filial.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_plans_property_vigente_key"
  ON "payment_plans"("property_id")
  WHERE "status" = 'vigente';

-- #17: una solicitud "solicitada" (pendiente) por filial+tipo de documento.
CREATE UNIQUE INDEX IF NOT EXISTS "document_requests_property_doctype_solicitada_key"
  ON "document_requests"("property_id", "doc_type")
  WHERE "status" = 'solicitada';
