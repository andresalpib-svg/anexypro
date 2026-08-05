-- ============================================================
-- ANEXYpro — Row-Level Security (aislamiento multi-tenant)
--
-- La aplicación establece SET app.current_company_id = '<uuid>' al
-- inicio de cada request autenticado (ver src/lib/db.ts,
-- withTenantContext()). Todas las tablas de datos de un tenant tienen
-- su política; los catálogos globales (fx_rates) no la necesitan.
--
-- IMPORTANTE: RLS es una segunda capa de defensa, no la única. La
-- capa de aplicación (Prisma + los `where: { condominiumId }` o
-- `where: { companyId }` explícitos en cada query de
-- src/lib/services/*.ts) sigue siendo la primera línea — igual que
-- en el prototipo, donde cada función ya filtraba por c.id antes de
-- que existiera este concepto de RLS real.
-- ============================================================

ALTER TABLE condominiums                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE structural_units               ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenity_schedules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE condominium_financial_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE condominium_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_access_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_invitations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_batches                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE charges                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_run_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_tariff_tiers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_readings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_service_suspensions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_targets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_recipients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_authorizations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_schedules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_checkins                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_log                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_milestones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_checklist_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_updates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assemblies                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_attachments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_topics                ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_votes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_ballots               ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log                      ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_condos ON condominiums USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_structunits ON structural_units USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_properties ON properties USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_amenities ON amenities USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_amenity_sched ON amenity_schedules USING (amenity_id IN (SELECT id FROM amenities WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_finsettings ON condominium_financial_settings USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_condodocs ON condominium_documents USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_audit ON audit_logs USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_persons ON persons USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_members ON property_members USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_maccess ON member_access_schedules USING (member_id IN (SELECT id FROM property_members WHERE property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_vehicles ON vehicles USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_pets ON pets USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_emg ON emergency_contacts USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_pevents ON property_events USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_persondocs ON person_documents USING (person_id IN (SELECT id FROM persons WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_invitations ON person_invitations USING (person_id IN (SELECT id FROM persons WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_batches ON fee_batches USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_charges ON charges USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_payments ON payments USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_allocs ON payment_allocations USING (payment_id IN (SELECT p.id FROM payments p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_runlog ON billing_run_log USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_wtiers ON water_tariff_tiers USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_wreadings ON water_readings USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_suspensions ON property_service_suspensions USING (property_id IN (SELECT p.id FROM properties p JOIN condominiums c ON c.id = p.condominium_id WHERE c.company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_comms ON communications USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_comm_targets ON communication_targets USING (communication_id IN (SELECT id FROM communications WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_comm_attach ON communication_attachments USING (communication_id IN (SELECT id FROM communications WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_comm_recipients ON communication_recipients USING (communication_id IN (SELECT id FROM communications WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_reservations ON reservations USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_calevents ON calendar_events USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_visits ON visit_authorizations USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_vschedules ON visit_schedules USING (authorization_id IN (SELECT id FROM visit_authorizations WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_checkins ON visit_checkins USING (authorization_id IN (SELECT id FROM visit_authorizations WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_incidents ON incidents USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_packages ON packages USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_content ON content_items USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_assets ON assets USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_providers ON providers USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_maint ON maintenance_tickets USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_maintphotos ON maintenance_photos USING (ticket_id IN (SELECT id FROM maintenance_tickets WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_authlog ON auth_log USING (user_id IN (SELECT id FROM users WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_projects ON projects USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_milestones ON project_milestones USING (project_id IN (SELECT id FROM projects WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_checklist ON project_checklist_items USING (project_id IN (SELECT id FROM projects WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_expenses ON project_expenses USING (project_id IN (SELECT id FROM projects WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_updates ON project_updates USING (project_id IN (SELECT id FROM projects WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_accounts ON chart_of_accounts USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_journal ON journal_entries USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_journallines ON journal_lines USING (entry_id IN (SELECT id FROM journal_entries WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_budget ON budget_lines USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_assemblies ON assemblies USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_assembly_attachments ON assembly_attachments USING (assembly_id IN (SELECT id FROM assemblies WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_assembly_topics ON assembly_topics USING (assembly_id IN (SELECT id FROM assemblies WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_assembly_votes ON assembly_votes USING (topic_id IN (SELECT id FROM assembly_topics WHERE assembly_id IN (SELECT id FROM assemblies WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')))));
CREATE POLICY tenant_assembly_ballots ON assembly_ballots USING (vote_id IN (SELECT id FROM assembly_votes WHERE topic_id IN (SELECT id FROM assembly_topics WHERE assembly_id IN (SELECT id FROM assemblies WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))))));
CREATE POLICY tenant_assembly_attendance ON assembly_attendance USING (assembly_id IN (SELECT id FROM assemblies WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY tenant_documents ON documents USING (condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id')));
CREATE POLICY tenant_document_versions ON document_versions USING (document_id IN (SELECT id FROM documents WHERE condominium_id IN (SELECT id FROM condominiums WHERE company_id = current_setting('app.current_company_id'))));
CREATE POLICY resident_read_documents ON documents FOR SELECT USING (visibility = 'residentes' AND status = 'vigente');
CREATE POLICY tenant_audit_log ON audit_log USING (company_id = current_setting('app.current_company_id'));

-- La aplicación se conecta con un rol de base de datos que tiene
-- BYPASSRLS = false. El pool de conexiones (src/lib/db.ts) ejecuta
-- `SELECT set_config('app.current_company_id', $1, true)` al tomar
-- cada conexión, con el companyId de la sesión autenticada — nunca
-- con un valor recibido directamente del cliente sin validar.

-- Caja chica (ronda 13). Aíslan por company_id propio, igual que
-- admin_tasks: la columna ya viene en la tabla, no hace falta el
-- subselect por condominio.
ALTER TABLE petty_cash_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE petty_cash_expenses    ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_pettycash_alloc ON petty_cash_allocations USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_pettycash_exp   ON petty_cash_expenses    USING (company_id = current_setting('app.current_company_id'));

-- Fase 0 y 1 de Finanzas: todas llevan company_id propio.
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_payments   ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_periods  ON accounting_periods USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_banks    ON bank_accounts      USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_supp     ON suppliers          USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_expenses ON expenses           USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_exppay   ON expense_payments   USING (company_id = current_setting('app.current_company_id'));

-- Fases 2 y 3 de Finanzas.
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_match_rules   ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_recurring ON recurring_expenses USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_contracts ON contracts          USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_banktx    ON bank_transactions  USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_bankrules ON bank_match_rules   USING (company_id = current_setting('app.current_company_id'));

-- Fases 4 y 5 de Finanzas.
ALTER TABLE reserve_funds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_fund_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_actions      ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_reserve    ON reserve_funds          USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_reservemov ON reserve_fund_movements USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_plans      ON payment_plans          USING (company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_collection ON collection_actions     USING (company_id = current_setting('app.current_company_id'));

-- Repositorio de documentos.
ALTER TABLE storage_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;
-- Las carpetas de plataforma (raiz "ANEXYpro" y "Condominios") no tienen
-- company_id: son comunes a todos los inquilinos.
CREATE POLICY tenant_folders ON storage_folders USING (company_id IS NULL OR company_id = current_setting('app.current_company_id'));
CREATE POLICY tenant_objects ON storage_objects USING (company_id = current_setting('app.current_company_id'));
