-- AlterTable
ALTER TABLE "amenities" ADD COLUMN     "rules_url" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "approx_cost" DECIMAL(14,2),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "photo_url" TEXT;

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

