-- ETAPA 9 — Facturación electrónica: PREPARACIÓN, no activación.
--
-- Crea la estructura y NADA MÁS: no hay datos, no hay catálogos
-- cargados, no hay credenciales y ningún flujo de Finanzas escribe en
-- estas tablas. Todos los condominios quedan en `inactivo`.
--
-- Se escribió a mano a partir de `prisma migrate diff` porque el diff
-- automático arrastraba desvíos previos ajenos a esta etapa: quería
-- convertir a TEXT las columnas `citext` de correo (`users.email`,
-- `persons.email`, `person_invitations.email`), que se crean por SQL
-- suelto para que el inicio de sesión no distinga mayúsculas. Aplicar
-- eso habría roto el login. Esas sentencias se quitaron a propósito y
-- el desvío sigue ahí, documentado en el informe de la etapa.

-- CreateEnum
CREATE TYPE "EInvoicingStatus" AS ENUM ('inactivo', 'configurado', 'validado', 'probado', 'activo', 'suspendido');


-- CreateEnum
CREATE TYPE "FiscalEnvironment" AS ENUM ('pruebas', 'produccion');


-- CreateEnum
CREATE TYPE "EInvoicingProviderKind" AS ENUM ('ninguno', 'integracion_propia', 'proveedor_externo');


-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('borrador', 'generado', 'enviado', 'aceptado', 'rechazado', 'anulado', 'error');


-- CreateTable
CREATE TABLE "fiscal_catalog_entries" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "spec_version" TEXT NOT NULL,
    "valid_from" DATE,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_catalog_entries_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "condominium_fiscal_settings" (
    "condominium_id" TEXT NOT NULL,
    "identification_type_code" TEXT,
    "identification_type_label" TEXT,
    "identification_number" TEXT,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "economic_activity_code" TEXT,
    "economic_activity_label" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "province_code" TEXT,
    "canton_code" TEXT,
    "district_code" TEXT,
    "province" TEXT,
    "canton" TEXT,
    "district" TEXT,
    "address_line" TEXT,
    "tax_condition_code" TEXT,
    "tax_condition_label" TEXT,
    "tax_regime_code" TEXT,
    "tax_regime_label" TEXT,
    "status" "EInvoicingStatus" NOT NULL DEFAULT 'inactivo',
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'pruebas',
    "providerKind" "EInvoicingProviderKind" NOT NULL DEFAULT 'ninguno',
    "provider_account_ref" TEXT,
    "spec_version" TEXT,
    "validated_at" TIMESTAMP(3),
    "tested_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "activated_by" TEXT,
    "suspended_at" TIMESTAMP(3),
    "suspend_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "condominium_fiscal_settings_pkey" PRIMARY KEY ("condominium_id")
);


-- CreateTable
CREATE TABLE "einvoicing_credentials" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "secret_ref" TEXT NOT NULL,
    "hint" TEXT,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "einvoicing_credentials_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "fiscal_sequences" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '001',
    "terminal" TEXT NOT NULL DEFAULT '00001',
    "last_number" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'borrador',
    "environment" "FiscalEnvironment" NOT NULL DEFAULT 'pruebas',
    "clave" TEXT,
    "consecutive" TEXT,
    "source_table" TEXT,
    "source_id" TEXT,
    "xml_generated_ref" TEXT,
    "xml_signed_ref" TEXT,
    "xml_sent_ref" TEXT,
    "response_ref" TEXT,
    "response_code" TEXT,
    "response_message" TEXT,
    "issued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "referenced_document_id" TEXT,
    "reference_code" TEXT,
    "reference_reason" TEXT,
    "provider_kind" "EInvoicingProviderKind" NOT NULL DEFAULT 'ninguno',
    "provider_document_ref" TEXT,
    "spec_version" TEXT,
    "total_amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "fiscal_document_events" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "from_status" "FiscalDocumentStatus",
    "to_status" "FiscalDocumentStatus" NOT NULL,
    "user_id" TEXT,
    "detail" TEXT,
    "payload_ref" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_document_events_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "fiscal_catalog_entries_kind_is_active_idx" ON "fiscal_catalog_entries"("kind", "is_active");


-- CreateIndex
CREATE UNIQUE INDEX "fiscal_catalog_entries_kind_code_spec_version_key" ON "fiscal_catalog_entries"("kind", "code", "spec_version");


-- CreateIndex
CREATE INDEX "einvoicing_credentials_expires_at_idx" ON "einvoicing_credentials"("expires_at");


-- CreateIndex
CREATE UNIQUE INDEX "einvoicing_credentials_condominium_id_kind_key" ON "einvoicing_credentials"("condominium_id", "kind");


-- CreateIndex
CREATE UNIQUE INDEX "fiscal_sequences_condominium_id_document_type_branch_termin_key" ON "fiscal_sequences"("condominium_id", "document_type", "branch", "terminal");


-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_clave_key" ON "fiscal_documents"("clave");


-- CreateIndex
CREATE INDEX "fiscal_documents_condominium_id_status_idx" ON "fiscal_documents"("condominium_id", "status");


-- CreateIndex
CREATE INDEX "fiscal_documents_company_id_created_at_idx" ON "fiscal_documents"("company_id", "created_at" DESC);


-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_condominium_id_document_type_consecutive_key" ON "fiscal_documents"("condominium_id", "document_type", "consecutive");


-- CreateIndex
CREATE INDEX "fiscal_document_events_document_id_occurred_at_idx" ON "fiscal_document_events"("document_id", "occurred_at");


-- AddForeignKey
ALTER TABLE "condominium_fiscal_settings" ADD CONSTRAINT "condominium_fiscal_settings_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "einvoicing_credentials" ADD CONSTRAINT "einvoicing_credentials_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominium_fiscal_settings"("condominium_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominium_fiscal_settings"("condominium_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominium_fiscal_settings"("condominium_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_referenced_document_id_fkey" FOREIGN KEY ("referenced_document_id") REFERENCES "fiscal_documents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- AddForeignKey
ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
