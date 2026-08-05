-- CreateEnum
CREATE TYPE "ReserveMovementType" AS ENUM ('aporte', 'uso');

-- CreateEnum
CREATE TYPE "PaymentPlanStatus" AS ENUM ('vigente', 'cumplido', 'incumplido', 'cancelado');

-- CreateEnum
CREATE TYPE "CollectionActionType" AS ENUM ('recordatorio', 'aviso_vencido', 'aviso_formal', 'aviso_suspension', 'expediente_legal', 'llamada', 'nota');

-- CreateTable
CREATE TABLE "reserve_funds" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(14,2),
    "monthly_quota" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "account_code" TEXT NOT NULL DEFAULT '1200',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reserve_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserve_fund_movements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "mov_type" "ReserveMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mov_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "document_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserve_fund_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "total_debt" DECIMAL(14,2) NOT NULL,
    "down_payment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "installments" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "status" "PaymentPlanStatus" NOT NULL DEFAULT 'vigente',
    "notes" TEXT,
    "document_url" TEXT,
    "document_name" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_actions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "action_type" "CollectionActionType" NOT NULL,
    "channel" TEXT,
    "notes" TEXT,
    "debt_amount" DECIMAL(14,2),
    "days_overdue" INTEGER,
    "automated" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reserve_funds_company_id_condominium_id_idx" ON "reserve_funds"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "reserve_fund_movements_fund_id_mov_date_idx" ON "reserve_fund_movements"("fund_id", "mov_date" DESC);

-- CreateIndex
CREATE INDEX "payment_plans_company_id_condominium_id_idx" ON "payment_plans"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "payment_plans_property_id_status_idx" ON "payment_plans"("property_id", "status");

-- CreateIndex
CREATE INDEX "collection_actions_company_id_condominium_id_created_at_idx" ON "collection_actions"("company_id", "condominium_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "collection_actions_property_id_created_at_idx" ON "collection_actions"("property_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "reserve_funds" ADD CONSTRAINT "reserve_funds_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserve_fund_movements" ADD CONSTRAINT "reserve_fund_movements_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "reserve_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_actions" ADD CONSTRAINT "collection_actions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
