-- CreateEnum
CREATE TYPE "DocRequestType" AS ENUM ('certificacion_cuotas_al_dia', 'estado_cuenta');

-- CreateEnum
CREATE TYPE "DocRequestStatus" AS ENUM ('solicitada', 'aprobada', 'rechazada');

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "doc_type" "DocRequestType" NOT NULL,
    "status" "DocRequestStatus" NOT NULL DEFAULT 'solicitada',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_by" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "body_text" TEXT,
    "decided_by" TEXT,
    "decided_by_name" TEXT,
    "decided_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "issued_balance" DECIMAL(14,2),
    "issued_charged" DECIMAL(14,2),
    "issued_paid" DECIMAL(14,2),
    "issued_current" BOOLEAN,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "doc_type" "DocRequestType" NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#3B6EF5',
    "header_text" TEXT,
    "footer_text" TEXT,
    "admin_name" TEXT,
    "admin_details" TEXT,
    "body_template" TEXT,
    "signer_name" TEXT,
    "signer_title" TEXT,
    "requires_current_account" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_requests_condominium_id_status_idx" ON "document_requests"("condominium_id", "status");

-- CreateIndex
CREATE INDEX "document_requests_property_id_requested_at_idx" ON "document_requests"("property_id", "requested_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_condominium_id_doc_type_key" ON "document_templates"("condominium_id", "doc_type");

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

