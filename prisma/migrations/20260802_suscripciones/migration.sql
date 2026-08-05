-- CreateEnum
CREATE TYPE "SubscriptionPeriod" AS ENUM ('mensual', 'trimestral', 'semestral', 'anual');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "block_reason" TEXT,
ADD COLUMN     "blocked_at" TIMESTAMP(3),
ADD COLUMN     "next_payment_date" DATE,
ADD COLUMN     "plan_id" TEXT,
ADD COLUMN     "subscription_started_at" DATE;




-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "period" "SubscriptionPeriod" NOT NULL DEFAULT 'mensual',
    "max_condominiums" INTEGER NOT NULL DEFAULT 0,
    "grace_days" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CRC',
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "registered_by" TEXT,
    "registered_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE INDEX "subscription_payments_company_id_period_end_idx" ON "subscription_payments"("company_id", "period_end");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


