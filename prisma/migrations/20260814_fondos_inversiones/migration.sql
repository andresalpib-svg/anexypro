-- Etapa 5 — Fondos, reservas e inversiones.
--
-- Puramente aditivo a propósito (Fase A del plan): NO toca
-- `reserve_funds`/`reserve_fund_movements` — esas tablas siguen vivas
-- con los datos reales de producción intactos. Un script aparte migra
-- sus filas a `funds`/`fund_movements` (type='reserva') y la
-- aplicación se corta a leer/escribir los modelos nuevos; el DROP de
-- las tablas viejas queda deliberadamente para una fase posterior.
--
-- Nota: el diff automático de Prisma también proponía 3
-- `ALTER COLUMN ... SET DATA TYPE TEXT` sobre `persons`/`users`/
-- `person_invitations`.email — se excluyeron a mano: esas columnas son
-- `citext` (case-insensitive) por una migración raw SQL deliberada
-- (`20260805_indices_rendimiento`) que Prisma no modela nativamente:
-- aplicar ese diff habría revertido el login case-insensitive.

-- CreateEnum
CREATE TYPE "FundType" AS ENUM ('operativo', 'reserva', 'especial', 'proyecto', 'otro');

-- CreateEnum
CREATE TYPE "FundMovementType" AS ENUM ('aporte', 'uso', 'compromiso', 'liberacion', 'inversion', 'retorno');

-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('plazo_fijo', 'fondo_inversion', 'bono', 'certificado', 'otro');

-- CreateEnum
CREATE TYPE "InvestmentStatus" AS ENUM ('activa', 'vencida', 'liquidada', 'cancelada');

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "type" "FundType" NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(14,2),
    "monthly_quota" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "account_code" TEXT NOT NULL,
    "project_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_movements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "mov_type" "FundMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mov_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "document_url" TEXT,
    "investment_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "investment_type" "InvestmentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "maturity_date" DATE,
    "rate" DECIMAL(5,2) NOT NULL,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'activa',
    "bank_account_id" TEXT,
    "document_url" TEXT,
    "document_name" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_interests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "investment_id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "date" DATE NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funds_company_id_condominium_id_idx" ON "funds"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "funds_condominium_id_type_idx" ON "funds"("condominium_id", "type");

-- CreateIndex
CREATE INDEX "fund_movements_fund_id_mov_date_idx" ON "fund_movements"("fund_id", "mov_date" DESC);

-- CreateIndex
CREATE INDEX "investments_company_id_condominium_id_idx" ON "investments"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "investments_condominium_id_status_idx" ON "investments"("condominium_id", "status");

-- CreateIndex
CREATE INDEX "investment_interests_investment_id_date_idx" ON "investment_interests"("investment_id", "date" DESC);

-- CreateIndex
CREATE INDEX "investment_interests_condominium_id_date_idx" ON "investment_interests"("condominium_id", "date" DESC);

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_movements" ADD CONSTRAINT "fund_movements_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_movements" ADD CONSTRAINT "fund_movements_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investments" ADD CONSTRAINT "investments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_interests" ADD CONSTRAINT "investment_interests_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
