-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('mensual', 'bimensual', 'trimestral', 'semestral', 'anual');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('vigente', 'por_vencer', 'vencido', 'cancelado');

-- CreateEnum
CREATE TYPE "BankTxStatus" AS ENUM ('sin_conciliar', 'propuesto', 'conciliado', 'ignorado');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "recurring_id" TEXT;

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "frequency" "RecurringFrequency" NOT NULL DEFAULT 'mensual',
    "day_of_month" INTEGER NOT NULL DEFAULT 1,
    "lead_days" INTEGER NOT NULL DEFAULT 5,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_generated" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "monthly_amount" DECIMAL(14,2),
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "notice_days" INTEGER NOT NULL DEFAULT 30,
    "document_url" TEXT,
    "document_name" TEXT,
    "notes" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'vigente',
    "recurring_expense_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "tx_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2),
    "fingerprint" TEXT NOT NULL,
    "status" "BankTxStatus" NOT NULL DEFAULT 'sin_conciliar',
    "matched_type" TEXT,
    "matched_id" TEXT,
    "match_confidence" INTEGER,
    "matched_at" TIMESTAMP(3),
    "matched_by" TEXT,
    "import_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_match_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "times_used" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_match_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_company_id_condominium_id_idx" ON "recurring_expenses"("company_id", "condominium_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_recurring_expense_id_key" ON "contracts"("recurring_expense_id");

-- CreateIndex
CREATE INDEX "contracts_company_id_condominium_id_idx" ON "contracts"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "contracts_condominium_id_end_date_idx" ON "contracts"("condominium_id", "end_date");

-- CreateIndex
CREATE INDEX "bank_transactions_company_id_bank_account_id_tx_date_idx" ON "bank_transactions"("company_id", "bank_account_id", "tx_date" DESC);

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_status_idx" ON "bank_transactions"("bank_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bank_account_id_fingerprint_key" ON "bank_transactions"("bank_account_id", "fingerprint");

-- CreateIndex
CREATE INDEX "bank_match_rules_company_id_idx" ON "bank_match_rules"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_match_rules_bank_account_id_pattern_key" ON "bank_match_rules"("bank_account_id", "pattern");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_recurring_expense_id_fkey" FOREIGN KEY ("recurring_expense_id") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
