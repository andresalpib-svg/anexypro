-- ============================================================
-- ANEXYpro — Facturación electrónica (ETAPA 9: PREPARACIÓN)
--
-- Row-Level Security de las tablas nuevas + el disparador que hace
-- que un comprobante emitido NO se pueda reescribir.
--
-- Se despliega igual que el resto del SQL suelto, con
-- `scripts/desplegar-bd.ts` (`npm run db:sql`), que corre también en
-- `vercel-build`. Es idempotente: se puede correr las veces que sea.
--
-- NADA DE ESTO ACTIVA LA FACTURACIÓN ELECTRÓNICA. Son barandas para
-- una estructura que hoy está vacía.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Aislamiento multi-tenant
--
-- `fiscal_catalog_entries` NO lleva RLS a propósito: los catálogos de
-- Hacienda son públicos y los mismos para todo el país, igual que
-- `fx_rates`. Lo que sí se aísla es la CONFIGURACIÓN de cada
-- condominio y sus documentos.
-- ------------------------------------------------------------
ALTER TABLE condominium_fiscal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoicing_credentials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_sequences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_events      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_fiscal_settings ON condominium_fiscal_settings;
CREATE POLICY tenant_fiscal_settings ON condominium_fiscal_settings
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

DROP POLICY IF EXISTS tenant_einvoicing_credentials ON einvoicing_credentials;
CREATE POLICY tenant_einvoicing_credentials ON einvoicing_credentials
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

DROP POLICY IF EXISTS tenant_fiscal_sequences ON fiscal_sequences;
CREATE POLICY tenant_fiscal_sequences ON fiscal_sequences
  USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));

DROP POLICY IF EXISTS tenant_fiscal_documents ON fiscal_documents;
CREATE POLICY tenant_fiscal_documents ON fiscal_documents
  USING (company_id = current_setting('app.current_company_id'));

-- Los eventos se resuelven por su documento, igual que `fund_movements`
-- se resuelve por su fondo.
DROP POLICY IF EXISTS tenant_fiscal_document_events ON fiscal_document_events;
CREATE POLICY tenant_fiscal_document_events ON fiscal_document_events
  USING (document_id IN (SELECT id FROM fiscal_documents WHERE company_id = current_setting('app.current_company_id')));

-- FORCE, no solo ENABLE: sin esto el DUEÑO de las tablas —que es quien
-- corre las migraciones— se salta la política. El archivo 03 hace esto
-- mismo recorriendo `pg_policies`, pero ya corrió cuando se llega acá,
-- así que las políticas de arriba necesitan su propio FORCE.
ALTER TABLE condominium_fiscal_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE einvoicing_credentials      FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscal_sequences            FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents            FORCE ROW LEVEL SECURITY;
ALTER TABLE fiscal_document_events      FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Un comprobante emitido no se reescribe
--
-- La normativa no permite "corregir" un comprobante ya emitido: se
-- emite una nota de crédito o de débito que lo referencia. Si el
-- sistema dejara editar el original, el historial se podría maquillar
-- y la nota de crédito perdería sentido.
--
-- Por eso la regla vive en la BASE y no solo en el servicio: una
-- consulta suelta, un guion de mantenimiento o un error de
-- programación futuro tropiezan con esto igual.
--
-- Qué permite:
--   · Editar libremente mientras está en `borrador`.
--   · Avanzar de estado (`status`) y anotar la respuesta, las fechas,
--     las referencias a los XML y el identificador del proveedor — eso
--     es el ciclo de vida, no una reescritura.
--   · Anular: pasar a `anulado` desde cualquier estado.
-- Qué prohíbe, una vez fuera de `borrador`:
--   · Cambiar la clave, el consecutivo, el tipo de comprobante, el
--     monto, la moneda, el condominio o el documento referenciado.
--   · Volver a `borrador`.
--   · Borrar la fila.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fiscal_document_inmutable() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'borrador' THEN
    RETURN NEW;  -- todavía no se emitió nada
  END IF;

  IF NEW.status = 'borrador' THEN
    RAISE EXCEPTION 'Un comprobante ya emitido no puede volver a borrador (documento %).', OLD.id;
  END IF;

  IF NEW.clave                 IS DISTINCT FROM OLD.clave
     OR NEW.consecutive        IS DISTINCT FROM OLD.consecutive
     OR NEW.document_type      IS DISTINCT FROM OLD.document_type
     OR NEW.condominium_id     IS DISTINCT FROM OLD.condominium_id
     OR NEW.total_amount       IS DISTINCT FROM OLD.total_amount
     OR NEW.currency           IS DISTINCT FROM OLD.currency
     OR NEW.referenced_document_id IS DISTINCT FROM OLD.referenced_document_id
  THEN
    RAISE EXCEPTION 'Un comprobante emitido no se edita: emitir una nota de crédito o de débito que lo referencie (documento %).', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_document_inmutable ON fiscal_documents;
CREATE TRIGGER trg_fiscal_document_inmutable
  BEFORE UPDATE ON fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION fiscal_document_inmutable();

CREATE OR REPLACE FUNCTION fiscal_document_no_borrar() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'borrador' THEN
    RAISE EXCEPTION 'Un comprobante emitido no se borra: se anula (documento %).', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_document_no_borrar ON fiscal_documents;
CREATE TRIGGER trg_fiscal_document_no_borrar
  BEFORE DELETE ON fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION fiscal_document_no_borrar();

-- ------------------------------------------------------------
-- 3. El historial de estados no se toca
--
-- `fiscal_document_events` es de solo agregar. Sin esto, quien pudiera
-- editar el historial podría contar otra versión de los hechos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fiscal_event_solo_agregar() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'El historial de un comprobante no se modifica ni se borra.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_event_solo_agregar ON fiscal_document_events;
CREATE TRIGGER trg_fiscal_event_solo_agregar
  BEFORE UPDATE OR DELETE ON fiscal_document_events
  FOR EACH ROW EXECUTE FUNCTION fiscal_event_solo_agregar();

-- ------------------------------------------------------------
-- 4. El consecutivo no retrocede
--
-- Un consecutivo que baja significa repetir un número ya emitido.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fiscal_sequence_no_retrocede() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_number < OLD.last_number THEN
    RAISE EXCEPTION 'El consecutivo no puede retroceder (% → %).', OLD.last_number, NEW.last_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fiscal_sequence_no_retrocede ON fiscal_sequences;
CREATE TRIGGER trg_fiscal_sequence_no_retrocede
  BEFORE UPDATE ON fiscal_sequences
  FOR EACH ROW EXECUTE FUNCTION fiscal_sequence_no_retrocede();
