-- AlterTable
ALTER TABLE "amenities" ADD COLUMN     "exclusive_per_day" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "description" TEXT,
ADD COLUMN     "location" TEXT;

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "photo_url" TEXT,
ALTER COLUMN "email" SET DATA TYPE TEXT;

