-- AlterTable
ALTER TABLE "amenities" ADD COLUMN     "photo_url" TEXT;

-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'condominos';

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

