-- AlterEnum
ALTER TYPE "VisitStatus" ADD VALUE 'suspendida';

-- AlterEnum
ALTER TYPE "VisitType" ADD VALUE 'empleado';

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "visit_authorizations" ADD COLUMN     "arrival_time" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "relation" TEXT,
ADD COLUMN     "suspended_at" TIMESTAMP(3),
ADD COLUMN     "visitor_photo_url" TEXT;

-- AlterTable
ALTER TABLE "visit_checkins" ADD COLUMN     "checkout_by" TEXT,
ADD COLUMN     "override_out_of_schedule" BOOLEAN NOT NULL DEFAULT false;

