-- AlterTable
ALTER TABLE "communication_attachments" DROP COLUMN "title",
ADD COLUMN     "file_name" TEXT NOT NULL,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'documento',
ADD COLUMN     "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "person_invitations" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "condominium_supervisors" (
    "id" TEXT NOT NULL,
    "condominium_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "condominium_supervisors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "condominium_supervisors_condominium_id_user_id_key" ON "condominium_supervisors"("condominium_id", "user_id");

-- CreateIndex
CREATE INDEX "communication_attachments_communication_id_idx" ON "communication_attachments"("communication_id");

-- AddForeignKey
ALTER TABLE "condominium_supervisors" ADD CONSTRAINT "condominium_supervisors_condominium_id_fkey" FOREIGN KEY ("condominium_id") REFERENCES "condominiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "condominium_supervisors" ADD CONSTRAINT "condominium_supervisors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

