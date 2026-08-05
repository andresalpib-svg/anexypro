-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('corriendo', 'ok', 'error');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('mantenimiento', 'seguridad', 'servicios', 'administracion', 'jardineria', 'limpieza', 'seguros', 'honorarios', 'impuestos', 'proyectos', 'otro');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('borrador', 'por_aprobar', 'aprobado', 'pagado', 'anulado');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'contador';

-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "interest_base_charge_id" TEXT,
ADD COLUMN     "interest_through_date" DATE;

-- AlterTable
ALTER TABLE "condominium_financial_settings" ADD COLUMN     "auto_interest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expense_approval_threshold" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "interest_grace_days" INTEGER,
ADD COLUMN     "interest_max_pct" DECIMAL(6,2) NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "run_key" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'corriendo',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "summary" TEXT,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'abierto',
    "closed_by" TEXT,
    "closed_at" TIMESTAMP(3),
    "reopen_reason" TEXT,
    "snapshot" JSONB,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "account_code" TEXT NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "tax_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "bank_account" TEXT,
    "default_account_code" TEXT,
    "default_category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "expense_number" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "account_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "invoice_number" TEXT,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "status" "ExpenseStatus" NOT NULL DEFAULT 'borrador',
    "document_url" TEXT,
    "document_name" TEXT,
    "notes" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "expense_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receipt_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_name_run_key_key" ON "job_runs"("job_name", "run_key");

-- CreateIndex
CREATE INDEX "accounting_periods_company_id_condominium_id_idx" ON "accounting_periods"("company_id", "condominium_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_condominium_id_period_key" ON "accounting_periods"("condominium_id", "period");

-- CreateIndex
CREATE INDEX "bank_accounts_company_id_condominium_id_idx" ON "bank_accounts"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "suppliers_company_id_idx" ON "suppliers"("company_id");

-- CreateIndex
CREATE INDEX "expenses_company_id_condominium_id_issue_date_idx" ON "expenses"("company_id", "condominium_id", "issue_date" DESC);

-- CreateIndex
CREATE INDEX "expenses_condominium_id_status_idx" ON "expenses"("condominium_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_condominium_id_expense_number_key" ON "expenses"("condominium_id", "expense_number");

-- CreateIndex
CREATE INDEX "expense_payments_expense_id_idx" ON "expense_payments"("expense_id");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_interest_base_charge_id_fkey" FOREIGN KEY ("interest_base_charge_id") REFERENCES "charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
