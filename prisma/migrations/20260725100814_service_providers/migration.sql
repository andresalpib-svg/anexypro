-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "service_providers" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_url" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_providers_category_visible_idx" ON "service_providers"("category", "visible");

