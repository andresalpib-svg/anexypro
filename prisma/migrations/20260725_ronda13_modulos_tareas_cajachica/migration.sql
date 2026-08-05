-- AlterTable
ALTER TABLE "admin_tasks" ADD COLUMN     "condominium_id" TEXT;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "hidden_modules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "petty_cash_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocated_on" DATE NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petty_cash_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash_expenses" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "spent_on" DATE NOT NULL,
    "detail" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "invoice_url" TEXT,
    "invoice_name" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "petty_cash_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "petty_cash_allocations_company_id_condominium_id_idx" ON "petty_cash_allocations"("company_id", "condominium_id");

-- CreateIndex
CREATE INDEX "petty_cash_expenses_company_id_condominium_id_spent_on_idx" ON "petty_cash_expenses"("company_id", "condominium_id", "spent_on");

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_allocations" ADD CONSTRAINT "petty_cash_allocations_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_allocations" ADD CONSTRAINT "petty_cash_allocations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_expenses" ADD CONSTRAINT "petty_cash_expenses_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "petty_cash_expenses" ADD CONSTRAINT "petty_cash_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

