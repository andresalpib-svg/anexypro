-- ============================================================
-- ANEXYpro — vistas, funciones y triggers complementarios
--
-- Prisma modela tablas, no vistas/funciones/triggers con la misma
-- fidelidad. Este archivo contiene TODA la lógica de negocio que
-- vivía como SQL puro en las 23 migraciones del prototipo — se
-- aplica DESPUÉS de `prisma migrate dev` (ver prisma/migrations/README.md
-- para el procedimiento exacto).
--
-- Cada bloque referencia el módulo/migración original de la que viene,
-- para poder auditar contra /home/claude/anexypro/schema-modulo-*.sql
-- si hace falta revisar el porqué de una regla.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Convertir columnas de email a citext (case-insensitive) — Prisma no
-- tiene un tipo nativo citext, así que se ajusta aquí después de que
-- `prisma migrate` las crea como texto normal.
ALTER TABLE users   ALTER COLUMN email TYPE citext;
ALTER TABLE persons ALTER COLUMN email TYPE citext;
ALTER TABLE person_invitations ALTER COLUMN email TYPE citext;

-- ---------- updated_at automático (todas las tablas con ese campo) ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','users','condominiums','structural_units','properties',
    'amenities','condominium_financial_settings','persons','property_members','vehicles','pets',
    'charges','payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON %I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I
                     FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

-- ============================================================
-- MÓDULO 1.3 — placa única por condominio (migración 02)
-- ============================================================
CREATE OR REPLACE FUNCTION check_unique_plate() RETURNS trigger AS $$
DECLARE v_condo text;
BEGIN
  SELECT condominium_id INTO v_condo FROM properties WHERE id = NEW.property_id;
  IF EXISTS (
    SELECT 1 FROM vehicles v
    JOIN properties p ON p.id = v.property_id
    WHERE upper(v.plate) = upper(NEW.plate)
      AND p.condominium_id = v_condo
      AND v.id <> COALESCE(NEW.id,'00000000-0000-0000-0000-000000000000')
      AND v.status = 'activo'
  ) THEN
    RAISE EXCEPTION 'La placa % ya está registrada en este condominio', NEW.plate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_vehicles_plate ON vehicles;
CREATE TRIGGER trg_vehicles_plate BEFORE INSERT OR UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION check_unique_plate();

-- ============================================================
-- MÓDULO 1.4 — estado de cuenta de acceso a la app (migración 03)
-- ============================================================
CREATE OR REPLACE VIEW v_person_account_status AS
SELECT p.id AS person_id,
       CASE
         WHEN p.user_id IS NOT NULL THEN 'activo'
         WHEN EXISTS (SELECT 1 FROM person_invitations i
                      WHERE i.person_id = p.id AND i.status = 'pendiente'
                        AND i.expires_at > now()) THEN 'invitado'
         ELSE 'sin_cuenta'
       END AS account_status
FROM persons p;

-- ============================================================
-- MÓDULO 1.5 — Finanzas (migraciones 04, 06, 07)
-- ============================================================

-- Mantiene el estado del cargo sincronizado con sus aplicaciones de pago.
CREATE OR REPLACE FUNCTION sync_charge_status() RETURNS trigger AS $$
DECLARE v_charge text; v_amount numeric; v_paid numeric;
BEGIN
  v_charge := COALESCE(NEW.charge_id, OLD.charge_id);
  SELECT c.amount INTO v_amount FROM charges c WHERE c.id = v_charge;
  SELECT COALESCE(sum(a.amount),0) INTO v_paid
    FROM payment_allocations a
    JOIN payments p ON p.id = a.payment_id AND p.status = 'aplicado'
    WHERE a.charge_id = v_charge;
  UPDATE charges SET status = (CASE
      WHEN status = 'anulado' THEN 'anulado'
      WHEN v_paid >= v_amount THEN 'pagado'
      WHEN v_paid > 0 THEN 'parcial'
      ELSE 'pendiente' END)::"ChargeStatus"
    WHERE id = v_charge;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_alloc_sync ON payment_allocations;
CREATE TRIGGER trg_alloc_sync AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION sync_charge_status();

-- Saldo por unidad: cargos vigentes − aplicaciones vigentes.
CREATE OR REPLACE VIEW v_property_balance AS
SELECT c.property_id, c.condominium_id,
       sum(c.amount) FILTER (WHERE c.status <> 'anulado') - COALESCE(sum(al.paid),0) AS balance
FROM charges c
LEFT JOIN LATERAL (
  SELECT sum(a.amount) AS paid FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.status = 'aplicado'
  WHERE a.charge_id = c.id
) al ON true
GROUP BY c.property_id, c.condominium_id;

-- Morosidad con antigüedad.
CREATE OR REPLACE VIEW v_delinquency AS
SELECT c.condominium_id, c.property_id,
       sum(c.amount - COALESCE(al.paid,0)) AS overdue_amount,
       max(CURRENT_DATE - c.due_date) AS days_overdue,
       CASE WHEN max(CURRENT_DATE - c.due_date) <= 30 THEN '0-30'
            WHEN max(CURRENT_DATE - c.due_date) <= 60 THEN '31-60'
            ELSE '61+' END AS aging_bucket
FROM charges c
LEFT JOIN LATERAL (
  SELECT sum(a.amount) AS paid FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id AND p.status = 'aplicado'
  WHERE a.charge_id = c.id
) al ON true
WHERE c.status IN ('pendiente','parcial') AND c.due_date < CURRENT_DATE
GROUP BY c.condominium_id, c.property_id;

-- Estatus por vencimiento — un cargo del mes en curso, aunque impago,
-- no pone la unidad en "saldo_pendiente" hasta el día siguiente a su
-- vencimiento.
CREATE OR REPLACE VIEW v_property_status AS
SELECT p.id AS property_id, p.condominium_id,
       CASE WHEN EXISTS (
         SELECT 1 FROM charges c WHERE c.property_id = p.id
           AND c.status IN ('pendiente','parcial') AND c.due_date < CURRENT_DATE
       ) THEN 'saldo_pendiente' ELSE 'al_dia' END AS status
FROM properties p;

-- Suspensión de servicios por morosidad — SOLO cuenta atraso en la
-- cuota condominal ordinaria. Bloquea reservas, autorización de
-- visitas y el Árbitro Legal IA (aplicado en la capa de servicio).
CREATE OR REPLACE VIEW v_property_suspension AS
SELECT p.id AS property_id, p.condominium_id,
       count(*) AS months_overdue_cuota,
       (cfs.suspension_enabled AND count(*) >= cfs.suspension_months) AS suspended
FROM properties p
JOIN condominium_financial_settings cfs ON cfs.condominium_id = p.condominium_id
LEFT JOIN charges c ON c.property_id = p.id AND c.charge_type = 'cuota_ordinaria'
       AND c.status IN ('pendiente','parcial') AND c.due_date < CURRENT_DATE
GROUP BY p.id, p.condominium_id, cfs.suspension_enabled, cfs.suspension_months;

CREATE OR REPLACE VIEW v_statement_totals AS
SELECT c.property_id, c.condominium_id,
       sum(c.amount) FILTER (WHERE c.status <> 'anulado') AS total_charged,
       COALESCE((SELECT sum(p.amount) FROM payments p
                 WHERE p.property_id = c.property_id AND p.status = 'aplicado'),0) AS total_paid
FROM charges c GROUP BY c.property_id, c.condominium_id;

CREATE OR REPLACE VIEW v_condo_finance_kpis AS
SELECT co.id AS condominium_id,
       count(pr.id) AS total_units,
       count(pr.id) FILTER (WHERE COALESCE(b.balance,0) <= 0) AS units_current,
       count(pr.id) FILTER (WHERE COALESCE(b.balance,0) > 0) AS units_delinquent
FROM condominiums co
JOIN properties pr ON pr.condominium_id = co.id AND pr.status = 'activa'
LEFT JOIN v_property_balance b ON b.property_id = pr.id
GROUP BY co.id;

-- Cálculo escalonado marginal del monto de agua.
DROP FUNCTION IF EXISTS water_amount(uuid, numeric);
CREATE OR REPLACE FUNCTION water_amount(p_condo text, p_m3 numeric) RETURNS numeric AS $$
DECLARE t record; remaining numeric := p_m3; prev_cap numeric := 0; span numeric; total numeric := 0;
BEGIN
  FOR t IN SELECT up_to_m3, price_per_m3 FROM water_tariff_tiers
           WHERE condominium_id = p_condo ORDER BY tier_order LOOP
    EXIT WHEN remaining <= 0;
    IF t.up_to_m3 IS NULL THEN span := remaining;
    ELSE span := LEAST(remaining, t.up_to_m3 - prev_cap); prev_cap := t.up_to_m3;
    END IF;
    total := total + span * t.price_per_m3;
    remaining := remaining - span;
  END LOOP;
  RETURN round(total, 2);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fx_rate_for(p_date date) RETURNS numeric AS $$
  SELECT sell_rate FROM fx_rates WHERE currency = 'USD' AND rate_date <= p_date
  ORDER BY rate_date DESC LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- MÓDULO 1.6 — Comunicados (migraciones 08, 10)
-- ============================================================
CREATE OR REPLACE VIEW v_communication_stats AS
SELECT communication_id,
       count(*) AS recipients,
       count(*) FILTER (WHERE read_at IS NOT NULL) AS app_reads,
       count(*) FILTER (WHERE email_opened_at IS NOT NULL) AS email_opens,
       round(100.0 * count(*) FILTER (WHERE read_at IS NOT NULL) / NULLIF(count(*),0), 1) AS app_read_pct,
       round(100.0 * count(*) FILTER (WHERE email_opened_at IS NOT NULL) / NULLIF(count(*),0), 1) AS email_open_pct
FROM communication_recipients GROUP BY communication_id;

-- ============================================================
-- MÓDULO 1.8 — Reservas (migraciones 09, 10)
-- ============================================================
CREATE OR REPLACE VIEW v_amenity_slots_taken AS
SELECT amenity_id, res_date, starts_at, ends_at
FROM reservations WHERE status IN ('pendiente_aprobacion','confirmada');

-- No solapamiento entre reservas vigentes de una misma amenidad.
-- starts_at/ends_at son "HH:mm" (texto); se anclan a una fecha fija
-- porque res_date ya se compara con = en esta misma restricción.
-- El cast text→time es STABLE para Postgres; este wrapper es seguro
-- como IMMUTABLE porque "HH:mm" no depende de datestyle ni timezone.
CREATE OR REPLACE FUNCTION hhmm_as_ts(t text) RETURNS timestamp AS $$
  SELECT DATE '2000-01-01' + t::time;
$$ LANGUAGE sql IMMUTABLE;

-- Se recrea en cada aplicación: el archivo corre en cada despliegue y
-- `ADD CONSTRAINT` sin este DROP fallaría la segunda vez.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS excl_reservation_overlap;
ALTER TABLE reservations ADD CONSTRAINT excl_reservation_overlap
  EXCLUDE USING gist (
    amenity_id WITH =,
    res_date WITH =,
    tsrange(hhmm_as_ts(starts_at), hhmm_as_ts(ends_at)) WITH &&
  ) WHERE (status IN ('pendiente_aprobacion','confirmada'));

-- Una reserva con costo solo puede confirmarse con comprobante adjunto.
CREATE OR REPLACE FUNCTION enforce_reservation_receipt() RETURNS trigger AS $$
DECLARE v_cost numeric;
BEGIN
  IF NEW.status = 'confirmada' THEN
    SELECT reservation_cost INTO v_cost FROM amenities WHERE id = NEW.amenity_id;
    IF v_cost > 0 AND NEW.receipt_url IS NULL THEN
      RAISE EXCEPTION 'No es posible confirmar una reserva con costo sin comprobante de pago adjunto';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_reservation_receipt ON reservations;
CREATE TRIGGER trg_reservation_receipt BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION enforce_reservation_receipt();

-- ============================================================
-- MÓDULO 1.7 — Calendario (migración 11)
-- ============================================================
CREATE OR REPLACE VIEW v_upcoming_events AS
SELECT id, condominium_id, title, event_type, event_date, event_time,
       source, communication_id, reservation_id
FROM calendar_events WHERE event_date >= CURRENT_DATE
ORDER BY event_date, event_time NULLS LAST;

-- ============================================================
-- MÓDULO 1.1 — Dashboard Ejecutivo (migración 12)
-- ============================================================
CREATE OR REPLACE VIEW v_company_overview AS
SELECT co.company_id,
       count(DISTINCT co.id) AS condos_count,
       count(DISTINCT co.id) FILTER (WHERE co.status = 'activo') AS condos_active,
       count(p.id) AS units_count
FROM condominiums co
LEFT JOIN properties p ON p.condominium_id = co.id AND p.status = 'activa'
WHERE co.deleted_at IS NULL GROUP BY co.company_id;

CREATE OR REPLACE VIEW v_recent_activity AS
SELECT pe.id, c.company_id, pe.property_id, p.code AS property_code,
       pe.event_type, pe.description, pe.created_by, pe.created_at
FROM property_events pe
JOIN properties p ON p.id = pe.property_id
JOIN condominiums c ON c.id = p.condominium_id
ORDER BY pe.created_at DESC;

-- ============================================================
-- MÓDULO 1.10 — Seguridad (migración 14): bitácora unificada
-- ============================================================
CREATE OR REPLACE VIEW v_security_log AS
SELECT vc.checkin_at AS occurred_at, 'ingreso' AS kind,
       va.condominium_id, va.property_id,
       va.visitor_name || ' — ' || va.visit_type AS summary, vc.registered_by AS actor
FROM visit_checkins vc JOIN visit_authorizations va ON va.id = vc.authorization_id
UNION ALL
SELECT vc.checkout_at, 'salida', va.condominium_id, va.property_id,
       va.visitor_name || ' — ' || va.visit_type, vc.registered_by
FROM visit_checkins vc JOIN visit_authorizations va ON va.id = vc.authorization_id
WHERE vc.checkout_at IS NOT NULL
UNION ALL
SELECT p.received_at, 'paquete', p.condominium_id, p.property_id,
       coalesce(p.courier,'Paquete') || ' — recibido', p.received_by
FROM packages p
UNION ALL
SELECT i.created_at, 'incidente', i.condominium_id, NULL,
       i.title || ' — ' || i.category, i.reported_by
FROM incidents i
ORDER BY 1 DESC;

-- ============================================================
-- MÓDULO Contabilidad — partida doble (migración 19, ajustada en 23)
-- ============================================================
CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS trigger AS $$
DECLARE total_debit numeric; total_credit numeric;
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO total_debit, total_credit FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF total_debit <> total_credit THEN
    RAISE EXCEPTION 'Asiento descuadrado: débitos % distintos de créditos %', total_debit, total_credit;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_journal_balance ON journal_lines;
CREATE CONSTRAINT TRIGGER trg_journal_balance
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balance();

ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS chk_debit_credit_xor;
ALTER TABLE journal_lines ADD CONSTRAINT chk_debit_credit_xor
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));

CREATE OR REPLACE VIEW v_libro_mayor AS
  SELECT je.condominium_id, jl.account_id, ca.code, ca.name, ca.type, ca.sub, ca.is_operating,
         je.entry_date, je.description, jl.debit, jl.credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    JOIN chart_of_accounts ca ON ca.id = jl.account_id
   WHERE je.status = 'confirmado';

CREATE OR REPLACE VIEW v_balance_general AS
  SELECT condominium_id, account_id, code, name, type, sub, SUM(debit) - SUM(credit) AS balance
    FROM v_libro_mayor WHERE type IN ('activo','pasivo','patrimonio')
   GROUP BY condominium_id, account_id, code, name, type, sub;

CREATE OR REPLACE VIEW v_estado_resultados AS
  SELECT condominium_id, account_id, code, name, type, is_operating,
         CASE WHEN type = 'ingreso' THEN SUM(credit) - SUM(debit) ELSE SUM(debit) - SUM(credit) END AS balance
    FROM v_libro_mayor WHERE type IN ('ingreso','gasto')
   GROUP BY condominium_id, account_id, code, name, type, is_operating;

-- ============================================================
-- MÓDULO 1.13 — Asambleas (migración 20): resultados en tiempo real
-- ============================================================
CREATE OR REPLACE VIEW v_assembly_vote_results AS
  SELECT v.id AS vote_id, t.assembly_id, t.title AS topic_title,
         COUNT(*) FILTER (WHERE b.choice='a_favor')   AS a_favor,
         COUNT(*) FILTER (WHERE b.choice='en_contra')  AS en_contra,
         COUNT(*) FILTER (WHERE b.choice='abstencion') AS abstencion,
         COUNT(*) AS total_votos
    FROM assembly_votes v
    JOIN assembly_topics t ON t.id = v.topic_id
    LEFT JOIN assembly_ballots b ON b.vote_id = v.id
   GROUP BY v.id, t.assembly_id, t.title;

-- ============================================================
-- MÓDULO 1.14 — Documentos (migración 21): alertas de vencimiento
-- ============================================================
CREATE OR REPLACE VIEW v_documents_expiring AS
  SELECT id, condominium_id, category, title, expires_on,
         (expires_on - CURRENT_DATE) AS days_remaining,
         CASE WHEN expires_on < CURRENT_DATE THEN 'vencido'
              WHEN expires_on <= CURRENT_DATE + INTERVAL '30 days' THEN 'por_vencer'
              ELSE 'vigente' END AS expiry_status
    FROM documents WHERE expires_on IS NOT NULL AND status = 'vigente';
