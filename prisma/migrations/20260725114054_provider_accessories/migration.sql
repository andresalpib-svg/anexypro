-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "service_providers" ADD COLUMN     "accessories" TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

