-- Gestión de Incumplimientos
--
-- Catálogo configurable por condominio, expediente por filial y tipo,
-- acciones emitidas (advertencias y multas) y sus evidencias.
-- Ver src/lib/domain/violations.ts para el motor de escalamiento.

-- CreateEnum
CREATE TYPE "ViolationActionKind" AS ENUM ('advertencia', 'multa');
-- CreateEnum
CREATE TYPE "ViolationCaseStatus" AS ENUM ('abierto', 'cerrado', 'anulado');
-- CreateEnum
CREATE TYPE "ViolationEvidenceKind" AS ENUM ('imagen', 'video');
-- CreateEnum
CREATE TYPE "ViolationEmailStatus" AS ENUM ('enviado', 'sin_configurar', 'error', 'sin_destinatario');
-- CreateTable
CREATE TABLE "violation_types" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "regulation_article" TEXT,
    "warnings_required" INTEGER NOT NULL DEFAULT 2,
    "days_between" INTEGER NOT NULL DEFAULT 15,
    "fine_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "immediate_fine" BOOLEAN NOT NULL DEFAULT false,
    "warning_template" TEXT,
    "fine_template" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "violation_types_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "violation_settings" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#3B6EF5',
    "header_text" TEXT,
    "footer_text" TEXT,
    "admin_name" TEXT,
    "admin_details" TEXT,
    "signer_name" TEXT,
    "signer_title" TEXT,
    "response_days" INTEGER NOT NULL DEFAULT 8,
    CONSTRAINT "violation_settings_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "violation_cases" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "violation_type_id" TEXT NOT NULL,
    "person_id" TEXT,
    "case_number" TEXT NOT NULL,
    "status" "ViolationCaseStatus" NOT NULL DEFAULT 'abierto',
    "warnings_issued" INTEGER NOT NULL DEFAULT 0,
    "fine_issued" BOOLEAN NOT NULL DEFAULT false,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_action_at" TIMESTAMP(3),
    "next_action_due_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "close_reason" TEXT,
    "created_by" TEXT,
    "created_by_name" TEXT,
    CONSTRAINT "violation_cases_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "violation_actions" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" "ViolationActionKind" NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" TEXT,
    "issued_by_name" TEXT,
    "supervisor_name" TEXT,
    "admin_name" TEXT,
    "observation" TEXT,
    "body_text" TEXT,
    "document_ref" TEXT,
    "email_status" "ViolationEmailStatus" NOT NULL DEFAULT 'sin_configurar',
    "email_to" TEXT,
    "email_error" TEXT,
    "fine_amount" DECIMAL(14,2),
    "charge_id" TEXT,
    "read_at" TIMESTAMP(3),
    "read_by" TEXT,
    CONSTRAINT "violation_actions_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "violation_evidences" (
    "id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "file_ref" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "kind" "ViolationEvidenceKind" NOT NULL DEFAULT 'imagen',
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "violation_evidences_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "violation_types_condominium_id_is_active_sort_order_idx" ON "violation_types"("condominium_id", "is_active", "sort_order");
-- CreateIndex
CREATE UNIQUE INDEX "violation_types_condominium_id_name_key" ON "violation_types"("condominium_id", "name");
-- CreateIndex
CREATE UNIQUE INDEX "violation_settings_condominium_id_key" ON "violation_settings"("condominium_id");
-- CreateIndex
CREATE INDEX "violation_cases_condominium_id_status_idx" ON "violation_cases"("condominium_id", "status");
-- CreateIndex
CREATE INDEX "violation_cases_property_id_violation_type_id_status_idx" ON "violation_cases"("property_id", "violation_type_id", "status");
-- CreateIndex
CREATE INDEX "violation_cases_condominium_id_next_action_due_at_idx" ON "violation_cases"("condominium_id", "next_action_due_at");
-- CreateIndex
CREATE INDEX "violation_actions_case_id_issued_at_idx" ON "violation_actions"("case_id", "issued_at");
-- CreateIndex
CREATE INDEX "violation_actions_read_at_idx" ON "violation_actions"("read_at");
-- CreateIndex
CREATE INDEX "violation_evidences_action_id_idx" ON "violation_evidences"("action_id");
-- AddForeignKey
ALTER TABLE "violation_types" ADD CONSTRAINT "violation_types_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_settings" ADD CONSTRAINT "violation_settings_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_cases" ADD CONSTRAINT "violation_cases_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_cases" ADD CONSTRAINT "violation_cases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_cases" ADD CONSTRAINT "violation_cases_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_cases" ADD CONSTRAINT "violation_cases_violation_type_id_fkey" FOREIGN KEY ("violation_type_id") REFERENCES "violation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_actions" ADD CONSTRAINT "violation_actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "violation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_actions" ADD CONSTRAINT "violation_actions_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "violation_evidences" ADD CONSTRAINT "violation_evidences_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "violation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
